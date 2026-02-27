// ============================================================
// BODHI — Proactive Scheduler
// Sends daily briefings, evening reflections, weekly syntheses
// via Telegram on a cron schedule
// ============================================================

import cron, { type ScheduledTask } from "node-cron";
import type { Agent, ContextEngine } from "@seneca/core";
import type { MemoryService } from "@seneca/memory";

export type BriefingType = "morning" | "evening" | "weekly";

interface TelegramSender {
  sendProactiveMessage(text: string): Promise<void>;
}

interface NotionDataSource {
  getBriefingSummary(): Promise<string>;
}

export interface SchedulerConfig {
  agent: Agent;
  telegram: TelegramSender;
  memoryService: MemoryService;
  contextEngine: ContextEngine;
  timezone: string; // e.g. "Asia/Ulaanbaatar"
  notion?: NotionDataSource | null;
}

interface JobRecord {
  type: BriefingType;
  lastRun: Date | null;
  lastResult: "sent" | "skipped" | "error" | null;
  lastDurationMs: number | null;
}

// Briefing prompt templates — persona-aligned (Mirror mode, not prescriptive)
const PROMPTS: Record<BriefingType, string> = {
  morning: `You are generating a morning briefing for Sukhbat.

Below are his recent memories (facts, decisions, patterns from recent conversations).
Your job: observe patterns, notice what his energy is flowing toward, and ask ONE reflective question.

Rules:
- Mirror mode: observe, don't prescribe
- No filler, no motivational fluff
- Under 150 words
- End with one short question for reflection
- Use Markdown formatting`,

  evening: `You are generating an evening reflection for Sukhbat.

Below are memories from today. Review what actually happened.
Your job: one observation about the day, one question.

Rules:
- Mirror mode: reflect what you see, don't advise
- No "great job" or cheerleading
- Under 100 words
- End with one question
- Use Markdown formatting`,

  weekly: `You are generating a weekly synthesis for Sukhbat.

Below are memories from the past week. Synthesize what's been building.
Your job: patterns emerging, what's growing, what might need attention.

Rules:
- Mirror mode: notice patterns, don't prescribe actions
- Under 200 words
- End with one question about direction
- Use Markdown formatting`,
};

export class Scheduler {
  private config: SchedulerConfig;
  private tasks: ScheduledTask[] = [];
  private jobs: Map<BriefingType, JobRecord> = new Map();
  private running = false;

  constructor(config: SchedulerConfig) {
    this.config = config;

    // Initialize job records
    for (const type of ["morning", "evening", "weekly"] as BriefingType[]) {
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

    console.log("[scheduler] Started — morning 08:00, evening 18:00, weekly Sun 20:00 UB");
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
   * Manually trigger a briefing (for testing via API).
   */
  async trigger(type: BriefingType): Promise<{ status: string; content?: string; error?: string }> {
    return this.runBriefing(type);
  }

  /**
   * Get status of all jobs for API/dashboard.
   */
  getStatus(): {
    running: boolean;
    timezone: string;
    jobs: { type: BriefingType; lastRun: string | null; lastResult: string | null; lastDurationMs: number | null }[];
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
   * Core briefing logic: check memories → generate → send.
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

      // Optionally fetch Notion context (tasks, sessions)
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

      const prompt = `${PROMPTS[type]}

## Recent Memories (${recentMemories.length} items)

${memoriesText}

## Stats
- Total memories: ${stats.totalMemories}
- New in last 24h: ${stats.recentCount}
- Top tags: ${stats.topTags.map((t) => `${t.tag}(${t.count})`).join(", ") || "none"}${notionSection}

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
