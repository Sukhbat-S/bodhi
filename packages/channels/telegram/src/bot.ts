// ============================================================
// BODHI — Telegram Bot (Telegraf)
// Primary mobile interface for BODHI
// ============================================================

import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import Groq from "groq-sdk";
import type { Agent, ContextEngine, AIBackend } from "@seneca/core";
import {
  Bridge,
  resolveProject,
  getProjectOptions,
  requiresConfirmation,
  type BridgeProgressCallback,
} from "@seneca/bridge";
import type { MemoryService, MemoryExtractor } from "@seneca/memory";

interface GmailServiceLike {
  getUnreadCount(): Promise<number>;
  getRecent(limit: number): Promise<{ from: string; subject: string; isUnread: boolean; date: string }[]>;
}

interface CalendarServiceLike {
  getTodayEvents(): Promise<{ summary: string; start: string; end: string; isAllDay: boolean; location?: string }[]>;
}

interface ConversationServiceLike {
  createThread(channel: "telegram" | "web" | "cli"): Promise<{ id: string }>;
  getTurns(threadId: string): Promise<{ role: "user" | "assistant"; content: string }[]>;
  addTurn(threadId: string, turn: {
    role: "user" | "assistant";
    content: string;
    channel: "telegram" | "web" | "cli";
    modelUsed?: string;
    durationMs?: number;
  }): Promise<void>;
  updateTitle(threadId: string, title: string): Promise<void>;
  touchThread(threadId: string): Promise<void>;
  // Extraction tracking (optional — gracefully degrades if not available)
  getExtractionStatus?(threadId: string): Promise<{
    extractionStatus: string | null;
    extractionAttempts: number;
  } | null>;
  markExtracted?(threadId: string, status: "pending" | "success" | "failed" | "abandoned"): Promise<void>;
  getStaleThreads?(limit?: number): Promise<{
    id: string;
    channel: string;
    title: string | null;
    extractionStatus: string | null;
    extractionAttempts: number;
    lastActiveAt: Date;
  }[]>;
}

interface BotConfig {
  token: string;
  allowedUserId: string;
  agent: Agent;
  bridge: AIBackend;
  contextEngine: ContextEngine;
  memoryService: MemoryService;
  memoryExtractor: MemoryExtractor;
  gmailService?: GmailServiceLike;
  calendarService?: CalendarServiceLike;
  conversationService?: ConversationServiceLike;
  groqApiKey?: string;
}

export class TelegramBot {
  private bot: Telegraf;
  private agent: Agent;
  private bridge: AIBackend;
  private allowedUserId: string;
  private contextEngine: ContextEngine;
  private memoryService: MemoryService;
  private memoryExtractor: MemoryExtractor;
  private gmailService?: GmailServiceLike;
  private calendarService?: CalendarServiceLike;
  private conversationService?: ConversationServiceLike;
  private groq: Groq | null;
  private currentThreadId: string | null = null;
  private lastMessageAt: number = 0;
  private readonly THREAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private extractionTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private readonly RECOVERY_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  private pendingJournal = false;

  constructor(config: BotConfig) {
    this.bot = new Telegraf(config.token);
    this.agent = config.agent;
    this.bridge = config.bridge;
    this.allowedUserId = config.allowedUserId;
    this.contextEngine = config.contextEngine;
    this.memoryService = config.memoryService;
    this.memoryExtractor = config.memoryExtractor;
    this.gmailService = config.gmailService;
    this.calendarService = config.calendarService;
    this.conversationService = config.conversationService;
    this.groq = config.groqApiKey ? new Groq({ apiKey: config.groqApiKey }) : null;

    this.setupMiddleware();
    this.setupCommands();
    this.setupMessageHandler();
  }

  private setupMiddleware() {
    // Auth: only allow the owner
    this.bot.use(async (ctx, next) => {
      const userId = String(ctx.from?.id);
      if (userId !== this.allowedUserId) {
        return; // Silently ignore unauthorized users
      }
      return next();
    });
  }

  private setupCommands() {
    this.bot.command("start", (ctx) => {
      ctx.reply(
        "BODHI is online.\n\n" +
          "Commands:\n" +
          "/code <task> — Run Claude Code on your Mac\n" +
          "/ask <question> — Ask BODHI anything\n" +
          "/remember <text> — Save a memory\n" +
          "/recall <query> — Search memories\n" +
          "/journal [text] — Voice/text journal\n" +
          "/inbox — Email summary\n" +
          "/schedule — Today's calendar\n" +
          "/today — Combined snapshot\n" +
          "/status — Check system status\n" +
          "/projects — List registered projects\n" +
          "/help — Show this message"
      );
    });

    this.bot.command("help", (ctx) => {
      ctx.reply(
        "/code <project> <task> — Remote-control Claude Code\n" +
          "  Example: /code jewelry-platform fix the cart bug\n\n" +
          "/ask <question> — Ask BODHI (life, strategy, ideas)\n\n" +
          "/remember <text> — Store something in memory\n" +
          "/recall <query> — Search your memories\n" +
          "/journal [text] — Voice/text journal entry\n\n" +
          "/inbox — Recent emails + unread count\n" +
          "/schedule — Today's calendar events\n" +
          "/today — Combined snapshot (schedule + inbox)\n\n" +
          "/status — System status\n" +
          "/projects — List projects"
      );
    });

    // /code — The killer feature: remote Claude Code control
    this.bot.command("code", async (ctx) => {
      const text = ctx.message.text.replace(/^\/code\s*/, "").trim();

      if (!text) {
        return ctx.reply(
          "Usage: /code <project> <task>\n" +
            "Example: /code jewelry-platform fix the cart bug"
        );
      }

      // Parse: first word might be a project name
      const parts = text.split(/\s+/);
      const projectName = parts[0];
      const project = resolveProject(projectName);

      let prompt: string;
      let options: ReturnType<typeof getProjectOptions>;

      if (project) {
        prompt = parts.slice(1).join(" ");
        options = getProjectOptions(project);

        if (!prompt) {
          return ctx.reply(
            `Project: ${project.name} (${project.path})\n\nPlease provide a task after the project name.`
          );
        }
      } else {
        // No project matched — use entire text as prompt, default cwd
        prompt = text;
        options = {
          cwd: process.env.BODHI_PROJECT_DIR || process.cwd(),
          allowedTools: ["Read", "Edit", "Bash", "Grep", "Glob", "Write"],
          maxBudgetUsd: 3,
        };
      }

      // Safety check
      if (requiresConfirmation(prompt)) {
        return ctx.reply(
          "This task contains potentially destructive operations.\n\n" +
            `Task: ${prompt}\n\n` +
            "Send /confirm to proceed, or modify your request."
        );
      }

      // Send initial status message
      const statusMsg = await ctx.reply(
        `Running Claude Code...\n${options.cwd}\n\nTask: ${prompt}`
      );

      // Track progress for streaming updates
      let lastUpdate = Date.now();
      let progressText = "";

      const onProgress: BridgeProgressCallback = async (update) => {
        progressText = update.content;

        // Rate-limit Telegram edits to ~1 per second
        const now = Date.now();
        if (now - lastUpdate < 1000 && update.type === "progress") return;
        lastUpdate = now;

        const statusEmoji =
          update.type === "error"
            ? "Error"
            : update.type === "result"
              ? "Done"
              : "Working";

        // Truncate for Telegram (4096 char limit)
        const displayText = truncate(progressText, 3500);

        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            `${statusEmoji} — Claude Code\n${options.cwd}\n\n${displayText}`
          );
        } catch {
          // Edit might fail if content hasn't changed
        }
      };

      // Execute the task
      const task = await this.bridge.execute(prompt, options, onProgress as (update: { type: string; content: string }) => void);

      // Send final result
      const resultText = task.result || task.error || "No output.";
      const finalStatus = task.status === "completed" ? "Done" : "Failed";
      const duration = task.completedAt
        ? Math.round(
            (task.completedAt.getTime() - task.startedAt.getTime()) / 1000
          )
        : 0;

      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `${finalStatus} — Claude Code\n` +
            `${options.cwd}\n` +
            `${duration}s\n\n` +
            truncate(resultText, 3500)
        );
      } catch {
        // Fallback: send as new message
        await ctx.reply(
          `${finalStatus} — Claude Code\n\n${truncate(resultText, 3500)}`
        );
      }
    });

    // /ask — Chat with BODHI directly
    this.bot.command("ask", async (ctx) => {
      const question = ctx.message.text.replace(/^\/ask\s*/, "").trim();
      if (!question) {
        return ctx.reply("Usage: /ask <your question>");
      }

      await this.handleChat(ctx, question);
    });

    // /remember — Manually store a memory
    this.bot.command("remember", async (ctx) => {
      const text = ctx.message.text.replace(/^\/remember\s*/, "").trim();
      if (!text) {
        return ctx.reply("Usage: /remember <something to remember>");
      }

      try {
        await this.memoryService.store({
          content: text,
          type: "fact",
          source: "manual",
          importance: 0.8,
        });
        ctx.reply(`Remembered: "${truncate(text, 100)}"`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        ctx.reply(`Failed to store memory: ${msg}`);
      }
    });

    // /journal — Voice journal entry (next voice message becomes a journal)
    this.bot.command("journal", async (ctx) => {
      const text = ctx.message.text.replace(/^\/journal\s*/, "").trim();

      if (text) {
        // Text journal entry
        try {
          const count = await this.memoryExtractor.extractJournal(text);
          if (count > 0) {
            ctx.reply(`Journal entry captured. Extracted ${count} memory${count > 1 ? "s" : ""}.`);
          } else {
            // Still store as manual memory even if extraction found nothing notable
            await this.memoryService.store({
              content: text,
              type: "fact",
              source: "manual",
              importance: 0.6,
              tags: ["journal"],
            });
            ctx.reply("Journal entry stored.");
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          ctx.reply(`Journal failed: ${msg}`);
        }
        return;
      }

      // No text — set flag for next voice message to be treated as journal
      this.pendingJournal = true;
      ctx.reply(
        "Journal mode active. Send a voice message or type your thoughts.\n\n" +
          "Tip: Just talk naturally — what's on your mind, how your day went, any decisions you're mulling over."
      );
    });

    // /recall — Search memories
    this.bot.command("recall", async (ctx) => {
      const query = ctx.message.text.replace(/^\/recall\s*/, "").trim();
      if (!query) {
        return ctx.reply("Usage: /recall <search query>");
      }

      try {
        const memories = await this.memoryService.retrieve(query, 5);

        if (memories.length === 0) {
          return ctx.reply("No memories found.");
        }

        const lines = memories.map((m, i) => {
          const age = formatAge(m.createdAt);
          return `${i + 1}. [${m.type}] ${m.content}\n   (${age}, ${(m.similarity * 100).toFixed(0)}% match)`;
        });

        ctx.reply(`Memories matching "${truncate(query, 30)}":\n\n${lines.join("\n\n")}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        ctx.reply(`Memory search failed: ${msg}`);
      }
    });

    // /status — System status
    this.bot.command("status", (ctx) => {
      const bridgeRunning = "isRunning" in this.bridge ? (this.bridge as Bridge).isRunning : false;
      ctx.reply(
        `BODHI Status\n\n` +
          `Agent: online\n` +
          `Bridge: ${bridgeRunning ? "task running" : "idle"}\n` +
          `Memory: active\n` +
          `Channel: Telegram`
      );
    });

    // /projects — List projects
    this.bot.command("projects", async (ctx) => {
      const { listProjects } = await import("@seneca/bridge");
      const projects = listProjects();

      if (projects.length === 0) {
        return ctx.reply("No projects registered.");
      }

      const list = projects
        .map((p) => `${p.name}\n  ${p.path}`)
        .join("\n\n");

      ctx.reply(`Registered Projects:\n\n${list}`);
    });

    // /inbox — Email summary
    this.bot.command("inbox", async (ctx) => {
      if (!this.gmailService) {
        return ctx.reply("Gmail not connected. Configure Google credentials on the server.");
      }

      try {
        const [unread, recent] = await Promise.all([
          this.gmailService.getUnreadCount(),
          this.gmailService.getRecent(5),
        ]);

        const lines = recent.map((e) => {
          const flag = e.isUnread ? " *" : "";
          return `${e.from}: ${e.subject}${flag}\n  ${e.date}`;
        });

        ctx.reply(
          `Inbox (${unread} unread)\n\n${lines.length > 0 ? lines.join("\n\n") : "No recent emails."}`
        );
      } catch (err) {
        ctx.reply(`Failed to fetch inbox: ${err instanceof Error ? err.message : err}`);
      }
    });

    // /schedule — Today's calendar events
    this.bot.command("schedule", async (ctx) => {
      if (!this.calendarService) {
        return ctx.reply("Calendar not connected. Configure Google credentials on the server.");
      }

      try {
        const events = await this.calendarService.getTodayEvents();

        if (events.length === 0) {
          return ctx.reply("No events scheduled for today.");
        }

        const lines = events.map((e) => {
          const time = e.isAllDay
            ? "All day"
            : `${formatTimeShort(e.start)} - ${formatTimeShort(e.end)}`;
          const loc = e.location ? `\n  @ ${e.location}` : "";
          return `${time}: ${e.summary}${loc}`;
        });

        ctx.reply(`Today's Schedule (${events.length} events)\n\n${lines.join("\n\n")}`);
      } catch (err) {
        ctx.reply(`Failed to fetch schedule: ${err instanceof Error ? err.message : err}`);
      }
    });

    // /today — Combined snapshot (inbox + schedule)
    this.bot.command("today", async (ctx) => {
      const parts: string[] = [];

      if (this.calendarService) {
        try {
          const events = await this.calendarService.getTodayEvents();
          if (events.length > 0) {
            const lines = events.map((e) => {
              const time = e.isAllDay ? "All day" : formatTimeShort(e.start);
              return `  ${time}: ${e.summary}`;
            });
            parts.push(`Schedule (${events.length})\n${lines.join("\n")}`);
          } else {
            parts.push("Schedule: No events today");
          }
        } catch {
          parts.push("Schedule: unavailable");
        }
      }

      if (this.gmailService) {
        try {
          const [unread, recent] = await Promise.all([
            this.gmailService.getUnreadCount(),
            this.gmailService.getRecent(3),
          ]);
          const lines = recent.map((e) => `  ${e.from}: ${e.subject}`);
          parts.push(`Inbox (${unread} unread)\n${lines.join("\n")}`);
        } catch {
          parts.push("Inbox: unavailable");
        }
      }

      if (parts.length === 0) {
        return ctx.reply("No Google services connected. Configure credentials on the server.");
      }

      ctx.reply(`Today's Snapshot\n\n${parts.join("\n\n")}`);
    });
  }

  private setupMessageHandler() {
    // Handle plain messages (no command) as chat with BODHI
    this.bot.on(message("text"), async (ctx) => {
      const text = ctx.message.text;

      // Journal mode: treat next text message as journal entry
      if (this.pendingJournal) {
        this.pendingJournal = false;
        try {
          const count = await this.memoryExtractor.extractJournal(text);
          if (count > 0) {
            await ctx.reply(`Journal captured. ${count} memory${count > 1 ? "s" : ""} extracted.`);
          } else {
            await this.memoryService.store({
              content: text,
              type: "fact",
              source: "manual",
              importance: 0.6,
              tags: ["journal"],
            });
            await ctx.reply("Journal entry stored.");
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          await ctx.reply(`Journal failed: ${msg}`);
        }
        return;
      }

      // If it starts with "code:" or "code " treat as a code task
      if (/^code[\s:]/i.test(text)) {
        const task = text.replace(/^code[\s:]\s*/i, "");
        ctx.message.text = `/code ${task}`;
        // Re-route to code command handling
        return this.bot.handleUpdate({
          ...ctx.update,
          message: { ...ctx.message, text: `/code ${task}` },
        });
      }

      // Otherwise, chat with BODHI
      await this.handleChat(ctx, text);
    });

    // Handle photo messages — download image and let Claude see it via Read tool
    this.bot.on(message("photo"), async (ctx) => {
      const caption = ctx.message.caption || "";
      const text = caption || "What do you see in this image?";

      // Download the largest photo size (last in Telegram's array)
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      let imagePath: string | undefined;

      try {
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const response = await fetch(fileLink.href);
        const buffer = Buffer.from(await response.arrayBuffer());
        // Save inside project directory so Claude Code's Read tool has permission
        const tmpDir = join(process.cwd(), ".tmp");
        await mkdir(tmpDir, { recursive: true });
        imagePath = join(tmpDir, `bodhi-photo-${Date.now()}.jpg`);
        await writeFile(imagePath, buffer);
        console.log(`[telegram] Downloaded photo → ${imagePath} (${buffer.length} bytes)`);
      } catch (err) {
        console.error("[telegram] Failed to download photo:", err);
        // Fall back to text-only mode
      }

      try {
        await this.handleChat(ctx, text, imagePath);
      } finally {
        // Clean up temp file after bridge is done
        if (imagePath) {
          unlink(imagePath).catch(() => {});
        }
      }
    });

    // Handle document/file messages (with optional caption)
    this.bot.on(message("document"), async (ctx) => {
      const caption = ctx.message.caption || "";
      const fileName = ctx.message.document.file_name || "unknown file";
      const text = caption
        ? `[User sent a file: ${fileName}, caption: ${caption}]`
        : `[User sent a file: ${fileName}]`;
      await this.handleChat(ctx, text);
    });

    // Handle voice messages
    this.bot.on(message("voice"), async (ctx) => {
      if (!this.groq) {
        return ctx.reply("Voice transcription not configured (set GROQ_API_KEY).");
      }

      try {
        const text = await this.transcribeVoice(ctx, ctx.message.voice.file_id);

        // Journal mode: extract as journal entry instead of chatting
        if (this.pendingJournal) {
          this.pendingJournal = false;
          await ctx.reply(`Transcribed: "${truncate(text, 200)}"\n\nExtracting memories...`);
          const count = await this.memoryExtractor.extractJournal(text);
          if (count > 0) {
            await ctx.reply(`Journal captured. ${count} memory${count > 1 ? "s" : ""} extracted.`);
          } else {
            await this.memoryService.store({
              content: text,
              type: "fact",
              source: "manual",
              importance: 0.6,
              tags: ["journal", "voice-journal"],
            });
            await ctx.reply("Journal entry stored.");
          }
          return;
        }

        await this.handleChat(ctx, `[Voice message] ${text}`);
      } catch (error) {
        this.pendingJournal = false;
        const msg = error instanceof Error ? error.message : "Unknown error";
        await ctx.reply(`Voice transcription failed: ${msg}`);
      }
    });

    // Handle stickers
    this.bot.on(message("sticker"), async (ctx) => {
      const emoji = ctx.message.sticker.emoji || "";
      await this.handleChat(ctx, `[User sent a sticker ${emoji}]`);
    });
  }

  private async transcribeVoice(ctx: Context, fileId: string): Promise<string> {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const file = new File([arrayBuffer], "voice.ogg", { type: "audio/ogg" });

    const transcription = await this.groq!.audio.transcriptions.create({
      model: "whisper-large-v3-turbo",
      file,
    });

    return transcription.text;
  }

  private async resolveThread(): Promise<string | undefined> {
    if (!this.conversationService) return undefined;

    const now = Date.now();
    const elapsed = now - this.lastMessageAt;

    // Start new thread if: no current thread, or >30min inactivity
    if (!this.currentThreadId || elapsed > this.THREAD_TIMEOUT_MS) {
      // Thread just closed after inactivity — extract session memories
      if (this.currentThreadId && elapsed > this.THREAD_TIMEOUT_MS) {
        this.triggerSessionExtraction(this.currentThreadId);
      }
      const thread = await this.conversationService.createThread("telegram");
      this.currentThreadId = thread.id;
    }

    this.lastMessageAt = now;

    // Schedule proactive extraction timer (resets on each message)
    this.scheduleExtraction();

    return this.currentThreadId;
  }

  /**
   * Schedule proactive extraction: 30 min after last message.
   * If no new message arrives, extraction fires automatically.
   * This is the PRIMARY extraction trigger (not reactive like before).
   */
  private scheduleExtraction(): void {
    // Clear existing timer
    if (this.extractionTimer) {
      clearTimeout(this.extractionTimer);
      this.extractionTimer = null;
    }

    this.extractionTimer = setTimeout(() => {
      if (this.currentThreadId) {
        console.log(`[telegram] Session timeout — extracting memories from thread ${this.currentThreadId}`);
        this.triggerSessionExtraction(this.currentThreadId);
        this.currentThreadId = null;
      }
      this.extractionTimer = null;
    }, this.THREAD_TIMEOUT_MS);
  }

  /**
   * Trigger session extraction with dedup via extraction_status.
   * Sets status to 'pending' before starting, prevents duplicate extraction.
   */
  private triggerSessionExtraction(threadId: string): void {
    this.extractSessionMemories(threadId).catch((err) => {
      console.error("[telegram] Session extraction error:", err instanceof Error ? err.message : err);
    });
  }

  private async extractSessionMemories(threadId: string): Promise<void> {
    if (!this.conversationService) return;

    // Check extraction status to prevent duplicates
    if (this.conversationService.getExtractionStatus) {
      const status = await this.conversationService.getExtractionStatus(threadId);
      if (status?.extractionStatus === "success" || status?.extractionStatus === "pending") {
        console.log(`[telegram] Skipping extraction for ${threadId} — already ${status.extractionStatus}`);
        return;
      }
      if (status && status.extractionAttempts >= 3) {
        console.log(`[telegram] Abandoning extraction for ${threadId} — too many attempts (${status.extractionAttempts})`);
        if (this.conversationService.markExtracted) {
          await this.conversationService.markExtracted(threadId, "abandoned");
        }
        return;
      }
    }

    // Mark as pending before starting (dedup gate)
    if (this.conversationService.markExtracted) {
      await this.conversationService.markExtracted(threadId, "pending");
    }

    try {
      const turns = await this.conversationService.getTurns(threadId);
      if (turns.length >= 4) {
        console.log(`[telegram] Auto-extracting session memories from thread ${threadId} (${turns.length} turns)`);
        await this.memoryExtractor.extractSession(turns);

        // Mark success
        if (this.conversationService.markExtracted) {
          await this.conversationService.markExtracted(threadId, "success");
        }
        console.log(`[telegram] ✅ Session extraction succeeded for thread ${threadId}`);
      } else {
        // Too few turns — mark success (nothing to extract, not a failure)
        if (this.conversationService.markExtracted) {
          await this.conversationService.markExtracted(threadId, "success");
        }
        console.log(`[telegram] Thread ${threadId} has only ${turns.length} turns — skipping extraction`);
      }
    } catch (err) {
      console.error("[telegram] ❌ Session extraction failed:", err instanceof Error ? err.message : err);
      // Mark failed — will be retried by periodic recovery
      if (this.conversationService.markExtracted) {
        await this.conversationService.markExtracted(threadId, "failed");
      }
    }
  }

  /**
   * Periodic recovery: runs every 15 min as a safety net.
   * Catches: timer failures, event loop stalls, missed triggers, server restarts.
   */
  private startRecoveryInterval(): void {
    this.recoveryInterval = setInterval(async () => {
      if (!this.conversationService?.getStaleThreads) return;

      try {
        const staleThreads = await this.conversationService.getStaleThreads(5);
        if (staleThreads.length === 0) return;

        console.log(`[telegram] Recovery: found ${staleThreads.length} stale thread(s) needing extraction`);

        for (const thread of staleThreads) {
          // Skip the currently active thread — it's still being talked to
          if (thread.id === this.currentThreadId) continue;

          // Skip very recent threads (still within the 30-min window)
          const age = Date.now() - new Date(thread.lastActiveAt).getTime();
          if (age < this.THREAD_TIMEOUT_MS) continue;

          console.log(`[telegram] Recovery: extracting thread ${thread.id} (${thread.title || "untitled"})`);
          await this.extractSessionMemories(thread.id);
        }
      } catch (err) {
        console.error("[telegram] Recovery sweep error:", err instanceof Error ? err.message : err);
      }
    }, this.RECOVERY_INTERVAL_MS);
  }

  private async loadHistory(): Promise<{ role: "user" | "assistant"; content: string }[]> {
    if (!this.conversationService || !this.currentThreadId) return [];
    return this.conversationService.getTurns(this.currentThreadId);
  }

  private async handleChat(ctx: Context, message: string, imagePath?: string) {
    const statusMsg = await ctx.reply(imagePath ? "Viewing image..." : "...");

    try {
      // Retrieve relevant context (memories)
      const context = await this.contextEngine.gather(message);

      // Resolve thread + load history for persistence
      const threadId = await this.resolveThread();
      const history = threadId ? await this.loadHistory() : undefined;

      let accumulated = "";

      const response = await this.agent.stream(
        message,
        context,
        (chunk) => {
          accumulated += chunk;
        },
        history,
        imagePath
      );

      // Send final response
      const displayText = truncate(response.content, 4000);

      try {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          undefined,
          displayText,
          { parse_mode: "Markdown" }
        );
      } catch {
        // Markdown parse error — retry without formatting
        try {
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            displayText
          );
        } catch {
          await ctx.reply(displayText);
        }
      }

      // Persist turns to database (fire-and-forget with error logging)
      if (this.conversationService && threadId) {
        this.conversationService.addTurn(threadId, {
          role: "user", content: message, channel: "telegram",
        }).catch((err) => console.error("[telegram] Failed to save user turn:", err instanceof Error ? err.message : err));
        this.conversationService.addTurn(threadId, {
          role: "assistant", content: response.content, channel: "telegram",
          modelUsed: response.model, durationMs: response.durationMs,
        }).catch((err) => console.error("[telegram] Failed to save assistant turn:", err instanceof Error ? err.message : err));
        this.conversationService.touchThread(threadId).catch((err) => console.error("[telegram] Failed to touch thread:", err instanceof Error ? err.message : err));

        // Auto-title on first message in thread
        if (history && history.length === 0) {
          const title = message.slice(0, 60) + (message.length > 60 ? "..." : "");
          this.conversationService.updateTitle(threadId, title).catch((err) => console.error("[telegram] Failed to update title:", err instanceof Error ? err.message : err));
        }
      }

      // Extract memories from this exchange (fire-and-forget with logging)
      this.memoryExtractor
        .extract(message, response.content, threadId || undefined)
        .catch((err) => {
          console.error("[telegram] Per-message extraction failed:", err instanceof Error ? err.message : err);
        });
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown error";
      try {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          undefined,
          `Error: ${errMsg}`
        );
      } catch {
        await ctx.reply(`Error: ${errMsg}`);
      }
    }
  }

  /**
   * Send a proactive message to the user (no incoming message context needed).
   * Used by Scheduler for briefings/reflections.
   */
  async sendProactiveMessage(text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(this.allowedUserId, text, {
        parse_mode: "Markdown",
      });
    } catch {
      // Retry without Markdown if parse fails
      await this.bot.telegram.sendMessage(this.allowedUserId, text);
    }
  }

  async start() {
    console.log("[telegram] Bot starting...");
    await this.bot.launch();
    this.startRecoveryInterval();
    console.log("[telegram] Bot is running (extraction recovery every 15 min)");
  }

  async stop() {
    // Clear timers
    if (this.extractionTimer) {
      clearTimeout(this.extractionTimer);
      this.extractionTimer = null;
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }

    // Extract current thread before shutdown (best-effort)
    if (this.currentThreadId) {
      console.log(`[telegram] Shutdown — extracting current thread ${this.currentThreadId}`);
      try {
        await this.extractSessionMemories(this.currentThreadId);
      } catch (err) {
        console.error("[telegram] Shutdown extraction failed:", err instanceof Error ? err.message : err);
      }
    }

    this.bot.stop("BODHI shutdown");
  }

  getBot() {
    return this.bot;
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n... (truncated)";
}

function formatTimeShort(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
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
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
