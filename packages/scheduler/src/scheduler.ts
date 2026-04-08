// ============================================================
// BODHI — Proactive Scheduler
// Sends daily briefings, evening reflections, weekly syntheses
// via Telegram on a cron schedule.
// Also runs daily memory synthesis (dedup, connect, decay, promote).
// ============================================================

import cron, { type ScheduledTask } from "node-cron";
import { readFile, writeFile } from "node:fs/promises";
import type { Agent, ContextEngine } from "@seneca/core";
import type { MemoryService } from "@seneca/memory";
import type { MemorySynthesizer } from "@seneca/memory";
import type { InsightGenerator, Insight } from "@seneca/memory";

export type BriefingType = "morning" | "evening" | "weekly";
export type SchedulerJobType = BriefingType | "synthesis" | "inbox-triage" | "build-digest" | "workflow" | "persona-refresh" | "daily-intel" | "jewelry-changelog";

interface TelegramSender {
  sendProactiveMessage(text: string): Promise<void>;
}

interface NotionDataSource {
  getBriefingSummary(): Promise<string>;
}

interface GmailDataSource {
  getBriefingSummary(): Promise<string>;
  getRecent(limit: number): Promise<{ id: string; from: string; subject: string; isUnread: boolean; date: string; snippet: string }[]>;
  getMessageBody?(messageId: string): Promise<string | null>;
}

interface CalendarDataSource {
  getBriefingSummary(type: "morning" | "evening"): Promise<string>;
  createEvent?(input: { summary: string; start: string; end: string; description?: string }): Promise<{ id: string }>;
  listEvents?(timeMin: string, timeMax: string): Promise<Array<{ id: string; summary: string; start: string; end: string }>>;
  deleteEvent?(eventId: string): Promise<void>;
}

interface GitHubDataSource {
  getBriefingSummary(): Promise<string>;
  getActivity?(): Promise<{ commits: unknown[]; prs: Array<{ title: string; state: string }>; issues: unknown[] }>;
}

interface VercelDataSource {
  getBriefingSummary(): Promise<string>;
  getDeployments?(limit: number): Promise<Array<{ id: string; state: string; name: string; createdAt: number }>>;
}

interface SupabaseDataSource {
  getBriefingSummary(): Promise<string>;
}

export interface PushSender {
  sendToAll(payload: {
    title: string;
    body: string;
    type?: "morning" | "evening" | "weekly";
    url?: string;
    timestamp?: string;
  }): Promise<{ sent: number; failed: number }>;
}

export interface BriefingStore {
  save(type: "morning" | "evening" | "weekly" | "daily-intel" | "jewelry-changelog", content: string): Promise<void>;
}

interface EntityDataSource {
  getRecentlyActive(days: number, limit: number): Promise<{ name: string; type: string; mentionCount: number }[]>;
  getGraph(): Promise<{ nodes: { id: string; name: string; type: string; mentionCount: number }[]; edges: { sourceId: string; targetId: string; sharedMemoryCount: number }[] }>;
}

export interface SchedulerConfig {
  agent: Agent;
  telegram?: TelegramSender | null;
  memoryService: MemoryService;
  contextEngine: ContextEngine;
  timezone: string; // e.g. "Asia/Ulaanbaatar"
  notion?: NotionDataSource | null;
  gmail?: GmailDataSource | null;
  calendar?: CalendarDataSource | null;
  github?: GitHubDataSource | null;
  vercel?: VercelDataSource | null;
  supabase?: SupabaseDataSource | null;
  synthesizer?: MemorySynthesizer | null;
  insightGenerator?: InsightGenerator | null;
  pushSender?: PushSender | null;
  briefingStore?: BriefingStore | null;
  entityService?: EntityDataSource | null;
  workflows?: Map<string, import("@seneca/core").WorkflowDefinition>;
  personaPath?: string;
}

interface JobRecord {
  type: SchedulerJobType;
  lastRun: Date | null;
  lastResult: "sent" | "skipped" | "error" | null;
  lastDurationMs: number | null;
}

// Briefing prompt templates — persona-aligned (Mirror mode, not prescriptive)
const PROMPTS: Record<BriefingType, string> = {
  morning: `You are BODHI, generating a morning briefing.

Below are recent memories, today's calendar, inbox, active goals, and project context.
Your job: help him see clearly AND act decisively. Lead with what matters most today.

Structure your response in this order:
1. **Pattern** — one honest observation about where his energy and attention have been flowing. Reference specific memories. If you see repeated decisions, avoided topics, or energy shifts, name them.
2. **Today's Focus** — 3 specific tasks ranked by impact. For each:
   - What to do (concrete action, not vague)
   - Why it matters (connects to a goal, unblocks something, or has a deadline)
   - Estimated effort: quick (< 30min), focused (1-2h), or deep (half day)
   Format: "1. [task] — [why] (effort)"
   Base these on: stalled goals (>3 days no progress), pending items from recent sessions, calendar gaps, unfinished work from yesterday, and active project needs.
3. **Schedule** — calendar events + notable emails. Brief. If nothing, say "Clear day — use it."
4. **Goals check** — if goal-type memories exist, surface them. Flag stalled ones (>7 days no progress). If a goal hasn't been mentioned in 2+ weeks, ask if it's still active.
5. **One question** — a reflective question from the patterns you see. Not generic. Specific.

Rules:
- Mirror mode: observe and suggest, but don't cheerleader. Be direct.
- The task list is the HEADLINE. Calendar is context, tasks are the point.
- Tasks must be specific enough to start immediately — "work on jewelry platform" is too vague, "add Mongolian translations to the admin order page" is actionable.
- If you see something stalled or blocked, say it plainly.
- Under 250 words
- If Gmail or Calendar data is provided below, include it
- If GitHub, Vercel, or Supabase data is provided, check for: failed deploys, open PRs needing review, unread alerts
- If Entity data is provided, mention who/what is most active
- Use Markdown formatting`,

  evening: `You are generating an evening reflection for Sukhbat.

Below are memories from today, today's calendar events, and inbox activity.
Your job: reflect on what actually happened today, note what moved forward, and set up tomorrow.

Structure your response in this order:
1. **Done today** — what actually shipped or progressed. Be specific — commits, conversations, decisions made. If nothing notable, say "Quiet day."
2. **Still open** — anything started but not finished, or promised but not done. No judgment, just clarity.
3. **Inbox** — if there were notable emails or unanswered messages, mention them briefly. Otherwise skip.
4. **Tomorrow** — if tomorrow's schedule is provided, mention what's coming. Suggest 1 thing to start the day with based on what's still open.
5. **Observation** — one honest pattern you notice. If brain insights are provided, incorporate the most relevant one.

Rules:
- Mirror mode: reflect what you see, don't cheerleader
- "Still open" is not a guilt list — it's context for tomorrow
- Under 180 words
- If Gmail or Calendar data is provided below, you MUST include it
- If Entity data is provided, note which people and projects came up today
- Use Markdown formatting`,

  weekly: `You are generating a weekly synthesis for Sukhbat.

Below are memories from the past week, plus calendar and inbox context.
Your job: patterns emerging, what's growing, what might need attention.

Structure your response in this order:
1. **Week in Review** — what he focused on, key events and meetings from the calendar.
2. **Inbox Patterns** — any notable email threads or recurring senders worth flagging.
3. **Patterns** — what's building across projects, decisions, energy. Incorporate brain insights if provided.
4. **Connections** — if entity graph data is provided, highlight relationship patterns: who is connected to which projects, recurring collaborators.
5. **Attention** — anything that might need attention next week. Flag stalled decisions or neglected knowledge if listed in insights.
6. **Question** — one question about direction.

Rules:
- Mirror mode: notice patterns, don't prescribe actions
- Under 250 words
- If Gmail or Calendar data is provided below, you MUST include it
- If Entity data is provided, weave relationship patterns into your synthesis
- Use Markdown formatting`,
};

const INBOX_TRIAGE_PROMPT = `You are triaging Sukhbat's email inbox. Categorize each email and provide a structured summary.

For each email, assign ONE category:
- **ACTION** — needs a response or task from Sukhbat (highlight these first)
- **FYI** — worth knowing but no action needed
- **NOISE** — newsletters, promos, automated notifications (just count these)

Rules:
- Lead with ACTION items — these are the only emails that matter
- For FYI, give 1 line each
- For NOISE, just say "X newsletters/promos skipped"
- If you have memory context about a sender or project, mention why the email matters
- Be blunt and concise — this is a triage, not a summary
- Under 300 words total
- Use Markdown formatting

Output format:
**Inbox Triage** (X unread)

**Action Required:**
- [sender] subject — why it needs attention

**FYI:**
- [sender] subject — one line

**Skipped:** X newsletters, Y promos, Z notifications`;

const DAILY_INTEL_PROMPT = `You are BODHI, generating a daily intelligence brief for Sukhbat.

Below are tech news headlines fetched from Hacker News and other sources, plus Sukhbat's active goals and recent project work.

Your job: filter the noise and surface only what's RELEVANT to his work and interests.

Sukhbat is a 21-year-old builder from Mongolia working on:
- BODHI (personal AI companion, TypeScript monorepo)
- Shigtgee (jewelry e-commerce, Next.js + Supabase)
- Building in public on X and GitHub

His interests: Claude/Anthropic updates, AI tooling, TypeScript ecosystem, React, Supabase, Vercel, indie building, open source.

Structure your response:
1. **Must-Know** (0-3 items) — Only things that directly affect his active projects or tools he uses daily. If nothing qualifies, say "Nothing critical today."
2. **Worth Watching** (0-3 items) — Interesting developments in his space. Brief, one line each.
3. **Skip Today** — One sentence on what's trending but irrelevant to him.

Rules:
- Ruthless relevance filter. 2 relevant items > 10 generic ones.
- For each item: what happened + why it matters TO HIM specifically
- If a Claude Code update dropped, lead with it and explain what changed
- If something affects Supabase, Vercel, Next.js, or TypeScript — include it
- Under 200 words total
- If no news is genuinely relevant, say so honestly. "Quiet day — heads down." is a valid brief.
- Use Markdown formatting`;

const JEWELRY_CHANGELOG_PROMPT = `You are BODHI, generating a changelog update for the Shigtgee jewelry platform.

Below are recent git commits from the jewelry platform repository. Your job: translate developer commits into a simple, clear update message that a NON-TECHNICAL person can understand.

The audience is Suugii (Sukhbat's sister) who runs the jewelry business daily. She uses the admin panel for orders, products, and content. She communicates via Facebook Messenger in Mongolian.

Structure:
1. **Шинэ** (New) — New features she can use. Explain what it does and where to find it.
2. **Засвар** (Fixed) — Bugs that were fixed. Only include if they affected her workflow.
3. **Анхааруулга** (Note) — Anything she needs to know or do differently.

Rules:
- Write in Mongolian
- Use simple, everyday language — no code terms, no technical jargon
- Skip: refactors, dependency updates, CI changes, type fixes — she doesn't care
- If no user-facing changes, say: "Өнөөдөр системд ажиллаж байна, харагдах өөрчлөлт алга." (Working on the system today, no visible changes.)
- For each feature: explain WHERE to find it in the admin panel
- Under 150 words
- Include a friendly tone — she's family`;

export class Scheduler {
  private config: SchedulerConfig;
  private tasks: ScheduledTask[] = [];
  private jobs: Map<SchedulerJobType, JobRecord> = new Map();
  private running = false;

  constructor(config: SchedulerConfig) {
    this.config = config;

    // Initialize job records
    for (const type of ["morning", "evening", "weekly", "synthesis", "inbox-triage", "build-digest", "daily-intel", "jewelry-changelog"] as SchedulerJobType[]) {
      this.jobs.set(type, {
        type,
        lastRun: null,
        lastResult: null,
        lastDurationMs: null,
      });
    }
  }

  /**
   * Start all cron jobs. Call after TelegramBot.start().
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const tz = this.config.timezone;

    // Morning briefing: 08:00
    this.tasks.push(
      cron.schedule("0 8 * * *", () => this.runBriefing("morning"), {
        timezone: tz,
      })
    );

    // Evening reflection: 18:00
    this.tasks.push(
      cron.schedule("0 18 * * *", () => this.runBriefing("evening"), {
        timezone: tz,
      })
    );

    // Weekly synthesis: Sunday 20:00
    this.tasks.push(
      cron.schedule("0 20 * * 0", () => this.runBriefing("weekly"), {
        timezone: tz,
      })
    );

    // Daily intelligence: 07:30 — news + research digest before morning briefing
    this.tasks.push(
      cron.schedule("30 7 * * *", () => this.runDailyIntel(), {
        timezone: tz,
      })
    );
    console.log("[scheduler] Daily intel: 07:30 UB");

    // Jewelry changelog: 21:00 — translate today's commits for sisters
    this.tasks.push(
      cron.schedule("0 21 * * *", () => this.runJewelryChangelog(), {
        timezone: tz,
      })
    );
    console.log("[scheduler] Jewelry changelog: 21:00 UB");

    // Inbox triage: 09:00 daily
    if (this.config.gmail) {
      this.tasks.push(
        cron.schedule("0 9 * * *", () => this.runInboxTriage(), {
          timezone: tz,
        })
      );
    }

    // Memory synthesis: every 4h, gated by shouldRun() (12h + 3 sessions + no lock)
    if (this.config.synthesizer) {
      this.tasks.push(
        cron.schedule("0 */4 * * *", async () => {
          const gate = await this.config.synthesizer!.shouldRun();
          if (!gate.run) {
            console.log(`[scheduler] Synthesis skipped — ${gate.reason}`);
            return;
          }
          this.runSynthesis();
        }, { timezone: tz })
      );
      console.log("[scheduler] Started — morning 08:00, evening 18:00, weekly Sun 20:00, synthesis every 4h (gated) UB");
    } else {
      console.log("[scheduler] Started — morning 08:00, evening 18:00, weekly Sun 20:00 UB");
    }

    // Persona refresh: 23:00 daily — update "Right Now" section from recent activity
    this.tasks.push(
      cron.schedule("0 23 * * *", () => this.refreshPersona(), {
        timezone: tz,
      })
    );

    // Background watcher: every 5 min — KAIROS-lite event monitoring
    if (this.config.vercel || this.config.github || this.config.gmail) {
      this.tasks.push(
        cron.schedule("*/5 * * * *", () => this.watchLoop(), { timezone: tz })
      );
      console.log("[scheduler] Watcher: every 5min (Vercel/GitHub/Gmail alerts)");
    }

    // Build digest: Monday 10:00 — auto-generate build-in-public content
    if (this.config.github) {
      this.tasks.push(
        cron.schedule("0 10 * * 1", () => this.runBuildDigest(), {
          timezone: tz,
        })
      );
      console.log("[scheduler] Build digest: Mon 10:00 UB");
    }
  }

  /**
   * Stop all cron jobs.
   */
  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    this.running = false;
    console.log("[scheduler] Stopped");
  }

  /**
   * Manually trigger a briefing or synthesis (for testing via API).
   */
  async trigger(type: SchedulerJobType, workflowId?: string): Promise<{ status: string; content?: string; error?: string }> {
    if (type === "synthesis") {
      return this.runSynthesis();
    }
    if (type === "inbox-triage") {
      return this.runInboxTriage();
    }
    if (type === "build-digest") {
      return this.runBuildDigest();
    }
    if (type === "daily-intel") {
      return this.runDailyIntel();
    }
    if (type === "jewelry-changelog") {
      return this.runJewelryChangelog();
    }
    if (type === "workflow" && workflowId) {
      return this.runWorkflow(workflowId);
    }
    if (type === "workflow") {
      return { status: "error", error: "workflowId required" };
    }
    if (type === "persona-refresh") {
      return this.triggerPersonaRefresh();
    }
    return this.runBriefing(type);
  }

  /**
   * Run a multi-step workflow by ID.
   */
  async runWorkflow(workflowId: string): Promise<{ status: string; content?: string; error?: string }> {
    const definition = this.config.workflows?.get(workflowId);
    if (!definition) {
      return { status: "error", error: `Unknown workflow: ${workflowId}` };
    }

    const startTime = Date.now();
    try {
      console.log(`[scheduler] Running workflow "${workflowId}"...`);

      const result = await this.config.agent.runWorkflow(
        definition,
        undefined,
        (progress) => {
          console.log(`[scheduler] Workflow ${progress.workflowId} step ${progress.currentStep + 1}/${progress.totalSteps}: ${progress.stepName} (${progress.status})`);
        }
      );

      // Send briefing step output to Telegram (skip the calendar JSON step)
      const briefingStep = result.steps.find((s) => s.stepName === "generate-briefing");
      const lastStep = briefingStep || result.steps.filter((s) => !s.skipped).pop();
      if (lastStep) {
        try {
          await this.config.telegram?.sendProactiveMessage(lastStep.output);
        } catch {
          console.error("[scheduler] Failed to send workflow result to Telegram");
        }
      }

      // Create calendar events from the time-blocks step
      if (workflowId === "morning-research" && this.config.calendar?.createEvent) {
        const timeBlockStep = result.steps.find((s) => s.stepName === "create-time-blocks");
        if (timeBlockStep && !timeBlockStep.skipped) {
          try {
            const match = timeBlockStep.output.match(/\[[\s\S]*\]/);
            if (match) {
              const events = JSON.parse(match[0]) as { summary: string; start: string; end: string; description?: string }[];
              let created = 0;
              for (const event of events) {
                if (event.summary && event.start && event.end) {
                  await this.config.calendar.createEvent(event);
                  created++;
                }
              }
              console.log(`[scheduler] Created ${created} calendar time blocks from morning workflow`);
            }
          } catch (err) {
            console.error("[scheduler] Failed to create calendar events:", err instanceof Error ? err.message : err);
          }
        }
      }

      const summary = `Workflow "${definition.name}" ${result.status}: ${result.steps.length} steps in ${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      return { status: result.status, content: summary };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] Workflow "${workflowId}" failed: ${errMsg}`);
      return { status: "error", error: errMsg };
    }
  }

  /**
   * Get list of available workflow definitions.
   */
  getWorkflows(): { id: string; name: string; description: string; stepsCount: number }[] {
    if (!this.config.workflows) return [];
    return Array.from(this.config.workflows.values()).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      stepsCount: w.steps.length,
    }));
  }

  /**
   * Auto-refresh the "Right Now" section in the persona file.
   * Runs daily at 23:00 — summarizes today's activity from memories.
   */
  private async triggerPersonaRefresh(): Promise<{ status: string; content?: string; error?: string }> {
    try {
      await this.refreshPersona();
      return { status: "sent", content: "Persona 'Right Now' section refreshed" };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Parse morning briefing tasks and create calendar time blocks.
   * Cleans up previous [BODHI] events first to stay idempotent.
   */
  private async createTimeBlocks(briefingContent: string): Promise<void> {
    const cal = this.config.calendar!;

    // 1. Clean up any existing [BODHI] events for today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    if (cal.listEvents && cal.deleteEvent) {
      const existing = await cal.listEvents(todayStart, todayEnd);
      const bodhiEvents = existing.filter((e) => e.summary.startsWith("[BODHI]"));
      for (const e of bodhiEvents) {
        await cal.deleteEvent(e.id);
      }
      if (bodhiEvents.length > 0) {
        console.log(`[scheduler] Cleaned ${bodhiEvents.length} old [BODHI] calendar events`);
      }
    }

    // 2. Ask the Agent to extract time blocks from the briefing
    const prompt = `<system>
Extract the tasks from this morning briefing and create calendar time blocks for today.

Rules:
- Output ONLY a JSON array of objects with: summary, start, end, description
- Start and end must be ISO 8601 datetime strings for today (${now.toISOString().split("T")[0]})
- Prefix every summary with "[BODHI] "
- Spread tasks across the day starting from the next full hour
- "quick" tasks = 30 min, "focused" tasks = 1.5h, "deep" tasks = 3h
- Max 3 events. Skip if a task is vague.
- Leave 30-min gaps between events
- If no clear tasks, output an empty array: []
- Do NOT use any tools
</system>

Briefing:
${briefingContent}

Output the JSON array:`;

    const task = await this.config.agent.chat(prompt);
    const text = task.content || "";

    // 3. Parse JSON from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log("[scheduler] No calendar blocks extracted from briefing");
      return;
    }

    try {
      const blocks = JSON.parse(match[0]) as Array<{ summary: string; start: string; end: string; description?: string }>;
      if (!Array.isArray(blocks) || blocks.length === 0) return;

      let created = 0;
      for (const block of blocks.slice(0, 3)) {
        if (!block.summary || !block.start || !block.end) continue;
        const summary = block.summary.startsWith("[BODHI]") ? block.summary : `[BODHI] ${block.summary}`;
        await cal.createEvent!({ summary, start: block.start, end: block.end, description: block.description });
        created++;
      }
      console.log(`[scheduler] Created ${created} calendar time blocks from morning briefing`);
    } catch (err) {
      console.error("[scheduler] Failed to parse time blocks:", err instanceof Error ? err.message : err);
    }
  }

  private async refreshPersona(): Promise<void> {
    if (!this.config.personaPath) return;

    try {
      // Gather recent activity
      const [recentMemories, goals] = await Promise.all([
        this.config.memoryService.list(15),
        this.config.memoryService.retrieve("active goals current focus", 5),
      ]);

      // Build context for AI summary
      const recentText = recentMemories
        .map((m) => `- [${m.type}] ${m.content}`)
        .join("\n");
      const goalText = goals
        .filter((g) => g.type === "goal")
        .map((g) => `- ${g.content}`)
        .join("\n");

      const today = new Date().toISOString().slice(0, 10);
      const prompt = `<system>
You update a persona file's "Right Now" section. Write a concise status block based on recent memories and goals.

Format (keep it under 150 words):
## Right Now (updated ${today})

**Current focus:** [1-2 sentence summary of what's actively being built]

**Active projects:**
- [project 1 — brief status]
- [project 2 — brief status]

**Recent wins:** [2-3 concrete things accomplished recently]

**What matters this week:** [1-2 priorities]

Rules:
- Be specific, not generic
- Use facts from the memories, don't invent
- If no clear info, keep it short
- Do NOT use any tools
- Output ONLY the section text, starting with "## Right Now"
</system>

Recent memories:
${recentText}

Goals:
${goalText || "No explicit goals found"}`;

      const task = await this.config.agent.chat(prompt);
      const newSection = task.content.trim();

      if (!newSection.startsWith("## Right Now")) {
        console.error("[scheduler] Persona refresh: AI output didn't start with '## Right Now'");
        return;
      }

      // Read current persona and replace the "Right Now" section
      const persona = await readFile(this.config.personaPath, "utf-8");
      const rightNowRegex = /## Right Now[\s\S]*?(?=\n---\n)/;

      if (rightNowRegex.test(persona)) {
        const updated = persona.replace(rightNowRegex, newSection + "\n");
        await writeFile(this.config.personaPath, updated, "utf-8");
        console.log(`[scheduler] Persona "Right Now" section refreshed for ${today}`);
      } else {
        console.log("[scheduler] No 'Right Now' section found in persona — skipping refresh");
      }
    } catch (err) {
      console.error("[scheduler] Persona refresh failed:", err instanceof Error ? err.message : err);
    }
  }

  /**
   * Get status of all jobs for API/dashboard.
   */
  getStatus(): {
    running: boolean;
    timezone: string;
    jobs: { type: SchedulerJobType; lastRun: string | null; lastResult: string | null; lastDurationMs: number | null }[];
  } {
    return {
      running: this.running,
      timezone: this.config.timezone,
      jobs: Array.from(this.jobs.values()).map((j) => ({
        type: j.type,
        lastRun: j.lastRun?.toISOString() || null,
        lastResult: j.lastResult,
        lastDurationMs: j.lastDurationMs,
      })),
    };
  }

  /**
   * Run the memory synthesizer (dedup, connect, decay, promote).
   */
  private async runSynthesis(): Promise<{ status: string; content?: string; error?: string }> {
    const startTime = Date.now();
    const job = this.jobs.get("synthesis")!;

    if (!this.config.synthesizer) {
      return { status: "skipped", error: "No synthesizer configured" };
    }

    try {
      const report = await this.config.synthesizer.run();
      const summary = `Synthesis complete: ${report.deduped} deduped, ${report.connected} connected, ${report.crossProject} cross-project, ${report.decayed} decayed, ${report.promoted} promoted`;

      job.lastRun = new Date();
      job.lastResult = "sent";
      job.lastDurationMs = Date.now() - startTime;

      return { status: "sent", content: summary };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] Synthesis failed: ${errMsg}`);

      job.lastRun = new Date();
      job.lastResult = "error";
      job.lastDurationMs = Date.now() - startTime;

      return { status: "error", error: errMsg };
    }
  }

  /**
   * Inbox triage: fetch recent unread emails, generate AI categorization, send via Telegram.
   */
  private async runInboxTriage(): Promise<{ status: string; content?: string; error?: string }> {
    const startTime = Date.now();
    const job = this.jobs.get("inbox-triage")!;

    if (!this.config.gmail) {
      return { status: "skipped", error: "Gmail not configured" };
    }

    try {
      const emails = await this.config.gmail.getRecent(20);
      const unreadEmails = emails.filter((e) => e.isUnread);

      if (unreadEmails.length === 0) {
        job.lastRun = new Date();
        job.lastResult = "skipped";
        job.lastDurationMs = Date.now() - startTime;
        return { status: "skipped", content: "No unread emails" };
      }

      // Build email list for the prompt
      const emailLines = unreadEmails.map((e, i) => {
        return `${i + 1}. From: ${e.from} | Subject: ${e.subject} | ${e.date}\n   Preview: ${e.snippet.slice(0, 120)}`;
      }).join("\n\n");

      // Get memory context for relevant senders/topics
      let memoryContext = "";
      try {
        const topSenders = [...new Set(unreadEmails.slice(0, 5).map((e) => e.from))].join(", ");
        const context = await this.config.contextEngine.gather(`email from ${topSenders}`);
        if (context.fragments.length > 0) {
          memoryContext = `\n\n## Memory Context\n\n${context.fragments.map((f) => f.content).join("\n")}`;
        }
      } catch {
        // Non-critical
      }

      const prompt = `${INBOX_TRIAGE_PROMPT}

## Unread Emails (${unreadEmails.length})

${emailLines}${memoryContext}

Triage these emails now.`;

      console.log(`[scheduler] Generating inbox triage for ${unreadEmails.length} unread emails...`);
      const response = await this.config.agent.chat(prompt);

      const message = `📬 Inbox Triage\n\n${response.content}`;
      await this.config.telegram?.sendProactiveMessage(message);

      if (this.config.briefingStore) {
        try {
          await this.config.briefingStore.save("morning", `[Inbox Triage]\n\n${response.content}`);
        } catch {
          // Non-critical
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(`[scheduler] Inbox triage sent (${response.content.length} chars, ${(durationMs / 1000).toFixed(1)}s)`);

      job.lastRun = new Date();
      job.lastResult = "sent";
      job.lastDurationMs = durationMs;

      return { status: "sent", content: response.content };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] Inbox triage failed: ${errMsg}`);

      job.lastRun = new Date();
      job.lastResult = "error";
      job.lastDurationMs = Date.now() - startTime;

      return { status: "error", error: errMsg };
    }
  }

  // ─── Background Watcher (KAIROS-lite) ──────────────────────
  private watchState = { lastVercelState: "", lastPRCount: 0, lastUnreadCount: 0 };

  private async watchLoop(): Promise<void> {
    try {
      // Vercel: alert on deploy errors
      if (this.config.vercel?.getDeployments) {
        try {
          const deploys = await this.config.vercel.getDeployments(1);
          const latest = deploys[0];
          if (latest && latest.state === "ERROR" && this.watchState.lastVercelState !== "ERROR") {
            await this.config.telegram?.sendProactiveMessage(`⚠️ Deploy failed: ${latest.name}\nState: ERROR\nTime: ${latest.createdAt}`);
            console.log("[watcher] Vercel deploy ERROR alert sent");
          }
          if (latest) this.watchState.lastVercelState = latest.state;
        } catch { /* vercel check failed silently */ }
      }

      // GitHub: alert on new PRs
      if (this.config.github?.getActivity) {
        try {
          const activity = await this.config.github.getActivity();
          const openPRs = activity.prs.filter((p) => p.state === "open").length;
          if (openPRs > this.watchState.lastPRCount && this.watchState.lastPRCount > 0) {
            const newCount = openPRs - this.watchState.lastPRCount;
            await this.config.telegram?.sendProactiveMessage(`📬 ${newCount} new PR${newCount > 1 ? "s" : ""} opened (${openPRs} total open)`);
            console.log(`[watcher] GitHub new PR alert: +${newCount}`);
          }
          this.watchState.lastPRCount = openPRs;
        } catch { /* github check failed silently */ }
      }

      // Gmail: alert on inbox spike (>5 new unread in one check)
      if (this.config.gmail) {
        try {
          const recent = await this.config.gmail.getRecent(1);
          const unreadCount = recent.filter((e) => e.isUnread).length;
          // Use a full unread count if available — approximation via recent otherwise
          if (this.watchState.lastUnreadCount > 0 && unreadCount - this.watchState.lastUnreadCount > 5) {
            await this.config.telegram?.sendProactiveMessage(`📧 Inbox spike: ${unreadCount - this.watchState.lastUnreadCount} new unread emails`);
            console.log("[watcher] Gmail inbox spike alert");
          }
          this.watchState.lastUnreadCount = unreadCount;
        } catch { /* gmail check failed silently */ }
      }
    } catch (error) {
      console.error("[watcher] Watch loop error:", error instanceof Error ? error.message : error);
    }
  }

  /**
   * Build digest: generate a build-in-public post from recent git + memory data.
   * Runs every Monday — sends draft to Telegram for review before posting.
   */
  private async runBuildDigest(): Promise<{ status: string; content?: string; error?: string }> {
    const startTime = Date.now();
    const job = this.jobs.get("build-digest")!;

    if (!this.config.github) {
      return { status: "skipped", error: "GitHub not configured" };
    }

    try {
      // 1. Gather commits from the past 7 days
      const commits = await this.config.github.getBriefingSummary();

      // 2. Gather recent session memories
      const memories = await this.config.memoryService.retrieve("session progress built this week", 10);
      const memoryText = memories.map((m) => `- [${m.type}] ${m.content}`).join("\n");

      // 3. Generate build log via Agent
      const prompt = `You are writing a weekly "build in public" digest for X/Twitter.

Given the following activity from the past week, create a concise, engaging thread (2-4 tweets, each under 280 chars).

GIT ACTIVITY:
${commits}

SESSION MEMORIES:
${memoryText || "No session memories this week."}

Rules:
- Write in first person as a solo builder
- Be authentic, technical but accessible
- Format each tweet clearly with [Tweet 1], [Tweet 2], etc.
- No hashtags, no emojis
- Focus on: what was built, why it matters, what was learned`;

      const context = await this.config.contextEngine.gather("weekly build log digest");
      const response = await this.config.agent.chat(prompt, context);

      const content = `**Weekly Build Digest** (ready to post)\n\n${response.content}\n\n_Reply with /post to publish to X, or edit and post manually._`;

      await this.config.telegram?.sendProactiveMessage(content);

      job.lastRun = new Date();
      job.lastResult = "sent";
      job.lastDurationMs = Date.now() - startTime;

      console.log(`[scheduler] Build digest sent (${Date.now() - startTime}ms)`);
      return { status: "sent", content: response.content };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] Build digest failed: ${errMsg}`);

      job.lastRun = new Date();
      job.lastResult = "error";
      job.lastDurationMs = Date.now() - startTime;

      return { status: "error", error: errMsg };
    }
  }

  /**
   * Daily intelligence: fetch tech news, filter by relevance, send digest.
   * Runs at 07:30 — before morning briefing.
   */
  private async runDailyIntel(): Promise<{ status: string; content?: string; error?: string }> {
    const startTime = Date.now();
    const job = this.jobs.get("daily-intel")!;

    try {
      // 1. Fetch Hacker News top stories
      const hnStories = await this.fetchHackerNews(30);

      if (hnStories.length === 0) {
        console.log("[scheduler] Daily intel skipped — no news fetched");
        job.lastRun = new Date();
        job.lastResult = "skipped";
        job.lastDurationMs = Date.now() - startTime;
        return { status: "skipped" };
      }

      // 2. Get active goals and recent project context for relevance filtering
      const goalsResult = await this.config.memoryService.listFiltered({ type: "goal", limit: 5 });
      const recentWork = await this.config.memoryService.list(5);
      const goalsText = goalsResult.memories.length > 0
        ? goalsResult.memories.map((g) => `- ${g.content}`).join("\n")
        : "No active goals.";
      const recentText = recentWork.map((m) => `- [${m.type}] ${m.content}`).join("\n");

      // 3. Build prompt with news + context
      const newsText = hnStories
        .map((s, i) => `${i + 1}. ${s.title} (${s.score} points) — ${s.url || "discussion"}`)
        .join("\n");

      const prompt = `${DAILY_INTEL_PROMPT}

## Today's Tech News (Hacker News Top 30)

${newsText}

## Sukhbat's Active Goals

${goalsText}

## Recent Work

${recentText}

Generate the daily intelligence brief now.`;

      // 4. Generate via Agent
      console.log("[scheduler] Generating daily intel...");
      const response = await this.config.agent.chat(prompt);

      // 5. Store as briefing (dashboard-first) + send to Telegram as backup
      if (this.config.briefingStore) {
        try {
          await this.config.briefingStore.save("daily-intel", response.content);
        } catch (err) {
          console.error("[scheduler] Failed to persist daily-intel briefing:", err instanceof Error ? err.message : err);
        }
      }
      await this.config.telegram?.sendProactiveMessage(`📡 Daily Intel\n\n${response.content}`);

      // 6. Store notable items in memory
      try {
        const today = new Date().toISOString().split("T")[0];
        await this.config.memoryService.store({
          content: `Daily intelligence brief (${today}): ${response.content.slice(0, 300)}`,
          type: "event",
          importance: 0.4,
          tags: ["daily-intel", today],
        });
      } catch {
        // Non-critical — don't fail the job if memory store fails
      }

      job.lastRun = new Date();
      job.lastResult = "sent";
      job.lastDurationMs = Date.now() - startTime;

      console.log(`[scheduler] Daily intel sent (${Date.now() - startTime}ms)`);
      return { status: "sent", content: response.content };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] Daily intel failed: ${errMsg}`);

      job.lastRun = new Date();
      job.lastResult = "error";
      job.lastDurationMs = Date.now() - startTime;

      return { status: "error", error: errMsg };
    }
  }

  /**
   * Fetch top stories from Hacker News API.
   */
  private async fetchHackerNews(count: number): Promise<{ title: string; url: string; score: number }[]> {
    try {
      const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
      if (!res.ok) return [];

      const ids = (await res.json()) as number[];
      const topIds = ids.slice(0, count);

      // Fetch stories in parallel (batched)
      const stories = await Promise.allSettled(
        topIds.map(async (id) => {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          return r.json() as Promise<{ title: string; url?: string; score: number }>;
        })
      );

      return stories
        .filter((r): r is PromiseFulfilledResult<{ title: string; url?: string; score: number }> => r.status === "fulfilled")
        .map((r) => ({
          title: r.value.title || "Untitled",
          url: r.value.url || "",
          score: r.value.score || 0,
        }));
    } catch (err) {
      console.error("[scheduler] HN fetch failed:", err instanceof Error ? err.message : err);
      return [];
    }
  }

  /**
   * Jewelry changelog: read git log from jewelry repo, generate Mongolian update for sisters.
   * Runs at 21:00 daily.
   */
  private async runJewelryChangelog(): Promise<{ status: string; content?: string; error?: string }> {
    const startTime = Date.now();
    const job = this.jobs.get("jewelry-changelog")!;

    try {
      // 1. Get today's commits from jewelry repo via GitHub API or git log
      let commits = "";

      if (this.config.github?.getActivity) {
        try {
          const activity = await this.config.github.getActivity();
          commits = activity.commits
            .map((c: any) => `- ${c.message || c.commit?.message || "no message"}`)
            .join("\n");
        } catch {
          // Fall through to empty
        }
      }

      // 2. Also try local git log for the jewelry repo
      if (!commits) {
        try {
          const { execSync } = await import("node:child_process");
          const gitLog = execSync(
            'git log --oneline --since="24 hours ago" 2>/dev/null || echo ""',
            { cwd: "/Users/macbookpro/Documents/shigtgee", encoding: "utf-8" }
          ).trim();
          commits = gitLog || "";
        } catch {
          // jewelry repo might not exist on this machine
        }
      }

      if (!commits) {
        console.log("[scheduler] Jewelry changelog skipped — no commits today");
        job.lastRun = new Date();
        job.lastResult = "skipped";
        job.lastDurationMs = Date.now() - startTime;
        return { status: "skipped" };
      }

      // 3. Generate Mongolian changelog via Agent
      const prompt = `${JEWELRY_CHANGELOG_PROMPT}

## Today's Commits

${commits}

Generate the changelog now.`;

      console.log("[scheduler] Generating jewelry changelog...");
      const response = await this.config.agent.chat(prompt);

      // 4. Store as briefing (dashboard-first) + send to Telegram as backup
      if (this.config.briefingStore) {
        try {
          await this.config.briefingStore.save("jewelry-changelog", response.content);
        } catch (err) {
          console.error("[scheduler] Failed to persist jewelry-changelog briefing:", err instanceof Error ? err.message : err);
        }
      }
      await this.config.telegram?.sendProactiveMessage(`💎 Шигтгээ шинэчлэл\n\n${response.content}\n\n_Messenger-ээр эгчид дамжуулна уу._`);

      job.lastRun = new Date();
      job.lastResult = "sent";
      job.lastDurationMs = Date.now() - startTime;

      console.log(`[scheduler] Jewelry changelog sent (${Date.now() - startTime}ms)`);
      return { status: "sent", content: response.content };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] Jewelry changelog failed: ${errMsg}`);

      job.lastRun = new Date();
      job.lastResult = "error";
      job.lastDurationMs = Date.now() - startTime;

      return { status: "error", error: errMsg };
    }
  }

  /**
   * Core briefing logic: check memories → generate insights → generate → send.
   */
  private async runBriefing(type: BriefingType): Promise<{ status: string; content?: string; error?: string }> {
    const startTime = Date.now();
    const job = this.jobs.get(type)!;

    try {
      // 1. Check if there's content worth briefing on
      const stats = await this.config.memoryService.getStats();

      if (stats.totalMemories === 0) {
        console.log(`[scheduler] Skipping ${type} briefing — no memories at all`);
        job.lastRun = new Date();
        job.lastResult = "skipped";
        job.lastDurationMs = Date.now() - startTime;
        return { status: "skipped" };
      }

      // For morning/evening, skip if no recent activity (but always run weekly)
      if (type !== "weekly" && stats.recentCount === 0) {
        console.log(`[scheduler] Skipping ${type} briefing — no new memories in 24h`);
        job.lastRun = new Date();
        job.lastResult = "skipped";
        job.lastDurationMs = Date.now() - startTime;
        return { status: "skipped" };
      }

      // 2. Get recent memories for context
      const limit = type === "weekly" ? 20 : 10;
      const recentMemories = await this.config.memoryService.list(limit);

      // 3. Build the briefing prompt
      const memoriesText = recentMemories
        .map((m, i) => {
          const age = formatAge(m.createdAt);
          const tags = m.tags?.length ? ` [${m.tags.join(", ")}]` : "";
          return `${i + 1}. [${m.type}] ${m.content}${tags} (${age})`;
        })
        .join("\n");

      // Optionally fetch external context (Notion, Gmail, Calendar)
      let notionSection = "";
      if (this.config.notion) {
        try {
          const notionSummary = await this.config.notion.getBriefingSummary();
          if (notionSummary) {
            notionSection = `\n\n## Notion Workspace\n\n${notionSummary}`;
          }
        } catch (err) {
          console.error("[scheduler] Notion data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      let gmailSection = "";
      if (this.config.gmail) {
        try {
          const gmailSummary = await this.config.gmail.getBriefingSummary();
          if (gmailSummary) {
            gmailSection = `\n\n## Gmail Inbox\n\n${gmailSummary}`;
          }
        } catch (err) {
          console.error("[scheduler] Gmail data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      let calendarSection = "";
      if (this.config.calendar) {
        try {
          const briefingType = type === "evening" ? "evening" : "morning";
          const calSummary = await this.config.calendar.getBriefingSummary(briefingType);
          if (calSummary) {
            calendarSection = `\n\n## Google Calendar\n\n${calSummary}`;
          }
        } catch (err) {
          console.error("[scheduler] Calendar data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      // Fetch GitHub activity
      let githubSection = "";
      if (this.config.github) {
        try {
          const githubSummary = await this.config.github.getBriefingSummary();
          if (githubSummary) {
            githubSection = `\n\n## GitHub Activity\n\n${githubSummary}`;
          }
        } catch (err) {
          console.error("[scheduler] GitHub data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      // Fetch Vercel deployments
      let vercelSection = "";
      if (this.config.vercel) {
        try {
          const vercelSummary = await this.config.vercel.getBriefingSummary();
          if (vercelSummary) {
            vercelSection = `\n\n## Vercel Deployments\n\n${vercelSummary}`;
          }
        } catch (err) {
          console.error("[scheduler] Vercel data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      // Fetch Supabase health
      let supabaseSection = "";
      if (this.config.supabase) {
        try {
          const supabaseSummary = await this.config.supabase.getBriefingSummary();
          if (supabaseSummary) {
            supabaseSection = `\n\n## Supabase Infrastructure\n\n${supabaseSummary}`;
          }
        } catch (err) {
          console.error("[scheduler] Supabase data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      // Generate insights from memory patterns
      let insightsSection = "";
      if (this.config.insightGenerator) {
        try {
          const insights = await this.config.insightGenerator.generate();
          if (insights.length > 0) {
            insightsSection = `\n\n## Brain Insights\n\n${insights.map((i) => `- ${i.text}`).join("\n")}`;
          }
        } catch (err) {
          console.error("[scheduler] Insight generation failed:", err instanceof Error ? err.message : err);
        }
      }

      // Entity graph context
      let entitySection = "";
      if (this.config.entityService) {
        try {
          const days = type === "weekly" ? 7 : 1;
          const recentEntities = await this.config.entityService.getRecentlyActive(days, 10);
          if (recentEntities.length > 0) {
            entitySection = `\n\n## Active Entities (${type === "weekly" ? "this week" : "today"})\n\n`;
            entitySection += recentEntities
              .map((e) => `- ${e.type}: **${e.name}** (${e.mentionCount} mentions)`)
              .join("\n");

            // Add top co-occurrences for weekly briefing
            if (type === "weekly") {
              const graph = await this.config.entityService.getGraph();
              const topEdges = graph.edges
                .sort((a, b) => b.sharedMemoryCount - a.sharedMemoryCount)
                .slice(0, 5);
              if (topEdges.length > 0) {
                const nodeMap = new Map(graph.nodes.map((n) => [n.id, n.name]));
                entitySection += "\n\nTop connections:\n";
                entitySection += topEdges
                  .map((e) => `- ${nodeMap.get(e.sourceId) || "?"} + ${nodeMap.get(e.targetId) || "?"}: ${e.sharedMemoryCount} shared memories`)
                  .join("\n");
              }
            }
          }
        } catch (err) {
          console.error("[scheduler] Entity data fetch failed:", err instanceof Error ? err.message : err);
        }
      }

      const prompt = `${PROMPTS[type]}

## Recent Memories (${recentMemories.length} items)

${memoriesText}

## Stats
- Total memories: ${stats.totalMemories}
- New in last 24h: ${stats.recentCount}
- Top tags: ${stats.topTags.map((t) => `${t.tag}(${t.count})`).join(", ") || "none"}${notionSection}${gmailSection}${calendarSection}${githubSection}${vercelSection}${supabaseSection}${insightsSection}${entitySection}

Generate the ${type} briefing now.`;

      // 4. Generate briefing via Agent → Bridge → Claude Code CLI ($0)
      console.log(`[scheduler] Generating ${type} briefing...`);
      const context = await this.config.contextEngine.gather(`${type} briefing`);
      const response = await this.config.agent.chat(prompt, context);

      // 5. Send to Telegram
      const label =
        type === "morning"
          ? "🌅 Morning Briefing"
          : type === "evening"
            ? "🌆 Evening Reflection"
            : "📊 Weekly Synthesis";

      const message = `${label}\n\n${response.content}`;
      await this.config.telegram?.sendProactiveMessage(message);

      // 5b. Persist briefing to DB (for PWA feed)
      if (this.config.briefingStore) {
        try {
          await this.config.briefingStore.save(type, response.content);
        } catch (err) {
          console.error(`[scheduler] Failed to persist ${type} briefing:`, err instanceof Error ? err.message : err);
        }
      }

      // 5c. Auto-create calendar time blocks from morning briefing tasks
      if (type === "morning" && this.config.calendar?.createEvent && this.config.calendar?.listEvents && this.config.calendar?.deleteEvent) {
        try {
          await this.createTimeBlocks(response.content);
        } catch (err) {
          console.error("[scheduler] Calendar time-blocking failed:", err instanceof Error ? err.message : err);
        }
      }

      // 5d. Push to PWA subscribers
      if (this.config.pushSender) {
        try {
          const pushResult = await this.config.pushSender.sendToAll({
            title: label,
            body: response.content.slice(0, 200) + (response.content.length > 200 ? "..." : ""),
            type,
            url: "/briefings",
            timestamp: new Date().toISOString(),
          });
          console.log(`[scheduler] Push: ${pushResult.sent} sent, ${pushResult.failed} failed`);
        } catch (err) {
          console.error(`[scheduler] Push failed:`, err instanceof Error ? err.message : err);
        }
      }

      // 6. Log success
      const durationMs = Date.now() - startTime;
      console.log(
        `[scheduler] ${type} briefing sent (${response.content.length} chars, ${(durationMs / 1000).toFixed(1)}s)`
      );

      job.lastRun = new Date();
      job.lastResult = "sent";
      job.lastDurationMs = durationMs;

      return { status: "sent", content: response.content };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;
      console.error(`[scheduler] ${type} briefing failed: ${errMsg}`);

      job.lastRun = new Date();
      job.lastResult = "error";
      job.lastDurationMs = durationMs;

      return { status: "error", error: errMsg };
    }
  }
}

function formatAge(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}
