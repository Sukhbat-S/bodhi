// ============================================================
// BODHI — Telegram Bot (Telegraf)
// Primary mobile interface for BODHI
// ============================================================

import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import type { Agent, ContextEngine } from "@seneca/core";
import {
  Bridge,
  resolveProject,
  getProjectOptions,
  requiresConfirmation,
  type BridgeProgressCallback,
} from "@seneca/bridge";
import type { MemoryService, MemoryExtractor } from "@seneca/memory";

interface BotConfig {
  token: string;
  allowedUserId: string;
  agent: Agent;
  bridge: Bridge;
  contextEngine: ContextEngine;
  memoryService: MemoryService;
  memoryExtractor: MemoryExtractor;
}

export class TelegramBot {
  private bot: Telegraf;
  private agent: Agent;
  private bridge: Bridge;
  private allowedUserId: string;
  private contextEngine: ContextEngine;
  private memoryService: MemoryService;
  private memoryExtractor: MemoryExtractor;

  constructor(config: BotConfig) {
    this.bot = new Telegraf(config.token);
    this.agent = config.agent;
    this.bridge = config.bridge;
    this.allowedUserId = config.allowedUserId;
    this.contextEngine = config.contextEngine;
    this.memoryService = config.memoryService;
    this.memoryExtractor = config.memoryExtractor;

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
          "/recall <query> — Search your memories\n\n" +
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
          cwd: "/Users/macbookpro/Documents/jewelry-platform",
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
      const task = await this.bridge.execute(prompt, options, onProgress);

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
      const bridgeRunning = this.bridge.isRunning;
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
  }

  private setupMessageHandler() {
    // Handle plain messages (no command) as chat with BODHI
    this.bot.on(message("text"), async (ctx) => {
      const text = ctx.message.text;

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
  }

  private async handleChat(ctx: Context, message: string) {
    const statusMsg = await ctx.reply("...");

    try {
      // Retrieve relevant context (memories)
      const context = await this.contextEngine.gather(message);

      let accumulated = "";

      const response = await this.agent.stream(
        message,
        context,
        (chunk) => {
          accumulated += chunk;
        }
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

      // Extract memories from this conversation (fire-and-forget)
      this.memoryExtractor
        .extract(message, response.content)
        .catch(() => {});
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
    console.log("[telegram] Bot is running");
  }

  async stop() {
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
