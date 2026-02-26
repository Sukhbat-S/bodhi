// ============================================================
// SENECA — Main Server Entry Point
// Boots: Hono API + Telegraf Bot + Bridge
// ============================================================

import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Agent } from "@seneca/core";
import { Bridge } from "@seneca/bridge";
import { TelegramBot } from "@seneca/channel-telegram";
import { loadConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("🏛️  SENECA starting up...\n");

  // 1. Load and validate config
  const config = loadConfig();
  console.log(`  Environment: ${config.NODE_ENV}`);
  console.log(`  Port: ${config.PORT}`);

  // 2. Load persona
  const personaPath =
    config.PERSONA_PATH ||
    path.resolve(__dirname, "../../../configs/persona/seneca.md");

  let persona: string;
  try {
    persona = fs.readFileSync(personaPath, "utf-8");
    console.log(`  Persona: loaded from ${personaPath}`);
  } catch {
    console.error(`  Persona file not found: ${personaPath}`);
    process.exit(1);
  }

  // 3. Initialize Agent Core
  const agent = new Agent({
    persona,
    model: "claude-sonnet-4-5-20250929",
    maxIterations: 10,
    contextBudgetTokens: 2000,
  });
  console.log("  Agent: initialized (claude-sonnet-4-5-20250929)");

  // 4. Initialize Bridge (Claude Code remote control)
  const bridge = new Bridge();
  console.log("  Bridge: initialized (Claude Code CLI)");

  // 5. Initialize Telegram Bot
  const telegramBot = new TelegramBot({
    token: config.TELEGRAM_BOT_TOKEN,
    allowedUserId: config.TELEGRAM_ALLOWED_USER_ID,
    agent,
    bridge,
  });
  console.log(`  Telegram: configured (user ${config.TELEGRAM_ALLOWED_USER_ID})`);

  // 6. Set up Hono API server
  const app = new Hono();

  // Health check
  app.get("/", (c) => {
    return c.json({
      name: "SENECA",
      status: "online",
      version: "0.1.0",
      uptime: process.uptime(),
      bridgeRunning: bridge.isRunning,
    });
  });

  // API: Chat endpoint (for web/CLI channels later)
  app.post("/api/chat", async (c) => {
    const body = await c.req.json<{ message: string }>();

    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    const response = await agent.chat(body.message);
    return c.json({
      content: response.content,
      model: response.model,
      tokenUsage: response.tokenUsage,
      durationMs: response.durationMs,
    });
  });

  // API: Bridge endpoint (for web/CLI channels later)
  app.post("/api/code", async (c) => {
    const body = await c.req.json<{
      prompt: string;
      cwd?: string;
      maxTurns?: number;
      maxBudgetUsd?: number;
    }>();

    if (!body.prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const task = await bridge.execute(body.prompt, {
      cwd: body.cwd || "/Users/macbookpro/Documents/jewelry-platform",
      maxTurns: body.maxTurns,
      maxBudgetUsd: body.maxBudgetUsd,
    });

    return c.json({
      id: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      durationMs: task.completedAt
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : null,
    });
  });

  // API: Status
  app.get("/api/status", (c) => {
    return c.json({
      agent: "online",
      bridge: bridge.isRunning ? "running" : "idle",
      channels: {
        telegram: "connected",
        web: "available",
        cli: "available",
      },
    });
  });

  // 7. Start everything
  console.log("\n  Starting services...");

  // Start Hono API server
  serve({ fetch: app.fetch, port: config.PORT }, () => {
    console.log(`  API server: http://localhost:${config.PORT}`);
  });

  // Start Telegram bot (non-fatal — server stays up if bot token is invalid)
  try {
    await telegramBot.start();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Telegram: FAILED to start — ${msg}`);
    console.error("  (Server continues without Telegram)");
  }

  console.log("\n🏛️  SENECA is online.\n");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🏛️  SENECA shutting down...");
    try {
      await telegramBot.stop();
    } catch {
      // Bot wasn't running
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
