// ============================================================
// BODHI — Proactive Scheduler
// Sends daily briefings, evening reflections, weekly syntheses
// via Telegram on a cron schedule.
// Also runs daily memory synthesis (dedup, connect, decay, promote).
// ============================================================

import cron, { type ScheduledTask } from "node-cron";
import type { Agent, ContextEngine } from "@seneca/core";
import type { MemoryService } from "@seneca/memory";
import type { MemorySynthesizer } from "@seneca/memory";
import type { InsightGenerator, Insight } from "@seneca/memory";

export type BriefingType = "morning" | "evening" | "weekly";
export type SchedulerJobType = BriefingType | "synthesis";

interface TelegramSender {
  sendProactiveMessage(text: string): Promise<void>;
}

interface NotionDataSource {
  getBriefingSummary(): Promise<string>;
}

interface GmailDataSource {
  getBriefingSummary(): Promise<string>;
}

interface CalendarDataSource {
  getBriefingSummary(type: "morning" | "evening"): Promise<string>;
}

export interface SchedulerConfig {
  agent: Agent;
  telegram: TelegramSender;
  memoryService: MemoryService;
  contextEngine: ContextEngine;
  timezone: string; // e.g. "Asia/Ulaanbaatar"
  notion?: NotionDataSource | null;
  gmail?: GmailDataSource | null;
  calendar?: CalendarDataSource | null;
  synthesizer?: MemorySynthesizer | null;
  insightGenerator?: InsightGenerator | null;
}

interface JobRecord {
  type: SchedulerJobType;
  lastRun: Date | null;
  lastResult: "sent" | "skipped" | "error" | null;
  lastDurationMs: number | null;
}

// Briefing prompt templates — persona-aligned (Mirror mode, not prescriptive)
const PROMPTS: Record<BriefingType, string> = {
  morning: `You are generating a morning briefing for Sukhbat.

Below are his recent memories, today's calendar, and inbox summary.
Your job: give him a clear picture of his day, observe what his energy is flowing toward, and ask ONE reflective question.

Structure your response in this order:
1. **Today's Schedule** — list events with times. If no events, say "Clear day — no meetings."
2. **Inbox Snapshot** — unread count + any notable emails worth flagging (important senders, action items). Keep to 1-2 lines.
3. **Pattern/Observation** — one insight from recent memories about what he's building or where his attention is going.
4. **Brain Insights** — if insights are provided below, weave the most interesting one into your observation naturally.
5. **Question** — one short reflective question.

Rules:
- Mirror mode: observe, don't prescribe
- No filler, no motivational fluff
- Under 200 words
- If Gmail or Calendar data is provided below, you MUST include it in your briefing
- If no calendar/email data is present, skip those sections silently
- Use Markdown formatting`,

  evening: `You are generating an evening reflection for Sukhbat.

Below are memories from today, today's calendar events, and inbox activity.
Your job: reflect on what actually happened today and ask one question.

Structure your response in this order:
1. **Day Recap** — what happened today based on memories and calendar events.
2. **Inbox** — if there were notable emails today, mention them briefly. Otherwise skip.
3. **Observation** — one honest observation about the day. If brain insights are provided, incorporate the most relevant one.
4. **Tomorrow Preview** — if tomorrow's schedule is provided, mention what's coming.
5. **Question** — one question.

Rules:
- Mirror mode: reflect what you see, don't advise
- No "great job" or cheerleading
- Under 150 words
- If Gmail or Calendar data is provided below, you MUST include it
- Use Markdown formatting`,

  weekly: `You are generating a weekly synthesis for Sukhbat.

Below are memories from the past week, plus calendar and inbox context.
Your job: patterns emerging, what's growing, what might need attention.

Structure your response in this order:
1. **Week in Review** — what he focused on, key events and meetings from the calendar.
2. **Inbox Patterns** — any notable email threads or recurring senders worth flagging.
3. **Patterns** — what's building across projects, decisions, energy. Incorporate brain insights if provided.
4. **Attention** — anything that might need attention next week. Flag stalled decisions or neglected knowledge if listed in insights.
5. **Question** — one question about direction.

Rules:
- Mirror mode: notice patterns, don't prescribe actions
- Under 250 words
- If Gmail or Calendar data is provided below, you MUST include it
- Use Markdown formatting`,
};

export class Scheduler {
  private config: SchedulerConfig;
  private tasks: ScheduledTask[] = [];
  private jobs: Map<SchedulerJobType, JobRecord> = new Map();
  private running = false;

  constructor(config: SchedulerConfig) {
    this.config = config;

    // Initialize job records
    for (const type of ["morning", "evening", "weekly", "synthesis"] as SchedulerJobType[]) {
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

    // Memory synthesis: daily at 03:00 (dedup, connect, decay, promote)
    if (this.config.synthesizer) {
      this.tasks.push(
        cron.schedule("0 3 * * *", () => this.runSynthesis(), {
          timezone: tz,
        })
      );
      console.log("[scheduler] Started — morning 08:00, evening 18:00, weekly Sun 20:00, synthesis 03:00 UB");
    } else {
      console.log("[scheduler] Started — morning 08:00, evening 18:00, weekly Sun 20:00 UB");
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
  async trigger(type: SchedulerJobType): Promise<{ status: string; content?: string; error?: string }> {
    if (type === "synthesis") {
      return this.runSynthesis();
    }
    return this.runBriefing(type);
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
      const summary = `Synthesis complete: ${report.deduped} deduped, ${report.connected} connected, ${report.decayed} decayed, ${report.promoted} promoted`;

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

      const prompt = `${PROMPTS[type]}

## Recent Memories (${recentMemories.length} items)

${memoriesText}

## Stats
- Total memories: ${stats.totalMemories}
- New in last 24h: ${stats.recentCount}
- Top tags: ${stats.topTags.map((t) => `${t.tag}(${t.count})`).join(", ") || "none"}${notionSection}${gmailSection}${calendarSection}${insightsSection}

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
      await this.config.telegram.sendProactiveMessage(message);

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
