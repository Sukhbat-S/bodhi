// ============================================================
// BODHI — Main Server Entry Point
// Boots: Hono API + Telegraf Bot + Bridge + Memory
// ============================================================

import * as dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from monorepo root (npm workspaces may set cwd to apps/server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });

import { Agent, ContextEngine } from "@seneca/core";
import { Bridge } from "@seneca/bridge";
import { getDb } from "@seneca/db";
import { MemoryService, MemoryExtractor, MemoryContextProvider } from "@seneca/memory";
import { TelegramBot } from "@seneca/channel-telegram";
import { loadConfig } from "./config.js";

async function main() {
  console.log("🌳  BODHI starting up...\n");

  // 1. Load and validate config
  const config = loadConfig();
  console.log(`  Environment: ${config.NODE_ENV}`);
  console.log(`  Port: ${config.PORT}`);

  // 2. Load persona
  const personaPath =
    config.PERSONA_PATH ||
    path.resolve(__dirname, "../../../configs/persona/bodhi.md");

  let persona = "";
  try {
    persona = fs.readFileSync(personaPath, "utf-8");
    console.log(`  Persona: loaded from ${personaPath}`);
  } catch {
    console.error(`  Persona file not found: ${personaPath}`);
    process.exit(1);
  }

  // 3. Initialize Bridge (Claude Code CLI — powers ALL reasoning via Max subscription)
  const bridge = new Bridge();
  console.log("  Bridge: initialized (Claude Code CLI)");

  // 4. Initialize Database
  const db = getDb(config.DATABASE_URL);
  console.log("  Database: connected");

  // 5. Initialize Memory System
  const memoryService = new MemoryService(db, config.VOYAGE_API_KEY);
  const memoryExtractor = new MemoryExtractor(memoryService, bridge);
  const memoryProvider = new MemoryContextProvider(memoryService);
  console.log("  Memory: initialized (Voyage AI embeddings)");

  // 6. Initialize Context Engine
  const contextEngine = new ContextEngine();
  contextEngine.register(memoryProvider);
  console.log("  Context: initialized (1 provider)");

  // 7. Initialize Agent Core (routes through Bridge, not Anthropic API)
  const agent = new Agent(
    {
      persona,
      model: "claude-sonnet-4-5-20250929",
      maxIterations: 10,
      contextBudgetTokens: 2000,
    },
    bridge
  );
  console.log("  Agent: initialized (via Bridge → Max subscription)");

  // 8. Initialize Telegram Bot
  const telegramBot = new TelegramBot({
    token: config.TELEGRAM_BOT_TOKEN,
    allowedUserId: config.TELEGRAM_ALLOWED_USER_ID,
    agent,
    bridge,
    contextEngine,
    memoryService,
    memoryExtractor,
  });
  console.log(`  Telegram: configured (user ${config.TELEGRAM_ALLOWED_USER_ID})`);

  // 9. Set up Hono API server
  const app = new Hono();

  // CORS for dashboard (Vite dev on port 5173)
  app.use("/*", cors({
    origin: ["http://localhost:5173", "http://localhost:4000"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }));

  // Global error handler — return JSON errors instead of HTML
  app.onError((err, c) => {
    console.error(`[api] ${c.req.method} ${c.req.path} error:`, err.message);
    return c.json({ error: err.message }, 500);
  });

  // Health check
  app.get("/", (c) => {
    return c.json({
      name: "BODHI",
      status: "online",
      version: "0.2.0",
      uptime: process.uptime(),
      bridgeRunning: bridge.isRunning,
      memory: true,
    });
  });

  // API: Chat endpoint (for web/CLI channels later)
  app.post("/api/chat", async (c) => {
    const body = await c.req.json<{ message: string }>();

    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    // Retrieve relevant context
    const context = await contextEngine.gather(body.message);
    const response = await agent.chat(body.message, context);

    // Extract memories async
    memoryExtractor.extract(body.message, response.content).catch(() => {});

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

  // API: Memory endpoints
  app.get("/api/memories", async (c) => {
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
    const tag = c.req.query("tag") || undefined;
    const search = c.req.query("search") || undefined;

    const result = await memoryService.listFiltered({ limit, offset, tag, search });
    return c.json(result);
  });

  app.get("/api/memories/stats", async (c) => {
    const stats = await memoryService.getStats();
    return c.json(stats);
  });

  app.get("/api/memories/search", async (c) => {
    const q = c.req.query("q");
    if (!q) {
      return c.json({ error: "q query parameter is required" }, 400);
    }
    const limit = parseInt(c.req.query("limit") || "10");
    const results = await memoryService.retrieve(q, limit);
    return c.json({ memories: results });
  });

  app.post("/api/memories", async (c) => {
    const body = await c.req.json<{
      content: string;
      tags?: string[];
      importance?: number;
      type?: "fact" | "decision" | "pattern" | "preference" | "event";
    }>();
    if (!body.content) {
      return c.json({ error: "content is required" }, 400);
    }
    const id = await memoryService.store({
      content: body.content,
      tags: body.tags,
      importance: body.importance,
      type: body.type,
      source: "manual",
    });
    return c.json({ id }, 201);
  });

  app.delete("/api/memories/:id", async (c) => {
    const id = c.req.param("id");
    await memoryService.forget(id);
    return c.json({ deleted: true });
  });

  // API: Streaming chat (SSE)
  app.post("/api/chat/stream", async (c) => {
    const body = await c.req.json<{ message: string }>();
    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    const context = await contextEngine.gather(body.message);

    return streamSSE(c, async (stream) => {
      const response = await agent.stream(body.message, context, async (chunk) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: chunk }) });
      });

      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          content: response.content,
          model: response.model,
          durationMs: response.durationMs,
        }),
      });

      // Extract memories async (don't block SSE close)
      memoryExtractor.extract(body.message, response.content).catch(() => {});
    });
  });

  // API: Status
  app.get("/api/status", (c) => {
    return c.json({
      agent: "online",
      bridge: bridge.isRunning ? "running" : "idle",
      memory: "active",
      uptime: process.uptime(),
      channels: {
        telegram: "connected",
        web: "available",
        cli: "available",
      },
    });
  });

  // 10. Start everything
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

  console.log("\n🌳  BODHI is online.\n");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🌳  BODHI shutting down...");
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
