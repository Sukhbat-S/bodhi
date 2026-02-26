// ============================================================
// SENECA — Telegram Bot (Telegraf)
// Primary mobile interface for SENECA
// ============================================================

import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import type { Agent, UnifiedMessage, AgentResponse } from "@seneca/core";
import {
  Bridge,
  resolveProject,
  getProjectOptions,
  requiresConfirmation,
  type BridgeProgressCallback,
} from "@seneca/bridge";

interface BotConfig {
  token: string;
  allowedUserId: string;
  agent: Agent;
  bridge: Bridge;
}

export class TelegramBot {
  private bot: Telegraf;
  private agent: Agent;
  private bridge: Bridge;
  private allowedUserId: string;

  constructor(config: BotConfig) {
    this.bot = new Telegraf(config.token);
    this.agent = config.agent;
    this.bridge = config.bridge;
    this.allowedUserId = config.allowedUserId;

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
        "SENECA is online.\n\n" +
          "Commands:\n" +
          "/code <task> — Run Claude Code on your Mac\n" +
          "/ask <question> — Ask SENECA anything\n" +
          "/status — Check system status\n" +
          "/projects — List registered projects\n" +
          "/help — Show this message"
      );
    });

    this.bot.command("help", (ctx) => {
      ctx.reply(
        "/code <project> <task> — Remote-control Claude Code\n" +
          "  Example: /code jewelry-platform fix the cart bug\n\n" +
          "/ask <question> — Ask SENECA (life, strategy, ideas)\n\n" +
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
          "⚠️ This task contains potentially destructive operations.\n\n" +
            `Task: ${prompt}\n\n` +
            "Send /confirm to proceed, or modify your request.",
          { parse_mode: "Markdown" }
        );
      }

      // Send initial status message
      const statusMsg = await ctx.reply(
        `🔧 Running Claude Code...\n📁 ${options.cwd}\n\nTask: ${prompt}`
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
            ? "❌"
            : update.type === "result"
              ? "✅"
              : "⏳";

        // Truncate for Telegram (4096 char limit)
        const displayText = truncate(progressText, 3500);

        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            `${statusEmoji} Claude Code\n📁 ${options.cwd}\n\n${displayText}`
          );
        } catch {
          // Edit might fail if content hasn't changed
        }
      };

      // Execute the task
      const task = await this.bridge.execute(prompt, options, onProgress);

      // Send final result
      const resultText = task.result || task.error || "No output.";
      const finalEmoji = task.status === "completed" ? "✅" : "❌";
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
          `${finalEmoji} Claude Code — ${task.status}\n` +
            `📁 ${options.cwd}\n` +
            `⏱ ${duration}s\n\n` +
            truncate(resultText, 3500)
        );
      } catch {
        // Fallback: send as new message
        await ctx.reply(
          `${finalEmoji} Claude Code — ${task.status}\n\n${truncate(resultText, 3500)}`
        );
      }
    });

    // /ask — Chat with SENECA directly
    this.bot.command("ask", async (ctx) => {
      const question = ctx.message.text.replace(/^\/ask\s*/, "").trim();
      if (!question) {
        return ctx.reply("Usage: /ask <your question>");
      }

      await this.handleChat(ctx, question);
    });

    // /status — System status
    this.bot.command("status", (ctx) => {
      const bridgeRunning = this.bridge.isRunning;
      ctx.reply(
        `SENECA Status\n\n` +
          `Agent: online\n` +
          `Bridge: ${bridgeRunning ? "task running" : "idle"}\n` +
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
        .map((p) => `• ${p.name}\n  ${p.path}`)
        .join("\n\n");

      ctx.reply(`Registered Projects:\n\n${list}`);
    });
  }

  private setupMessageHandler() {
    // Handle plain messages (no command) as chat with SENECA
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

      // Otherwise, chat with SENECA
      await this.handleChat(ctx, text);
    });
  }

  private async handleChat(ctx: Context, message: string) {
    const statusMsg = await ctx.reply("Thinking...");

    try {
      let accumulated = "";

      const response = await this.agent.stream(
        message,
        undefined,
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

  async start() {
    console.log("[telegram] Bot starting...");
    await this.bot.launch();
    console.log("[telegram] Bot is running");
  }

  async stop() {
    this.bot.stop("SENECA shutdown");
  }

  getBot() {
    return this.bot;
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n... (truncated)";
}
