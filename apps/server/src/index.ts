// ============================================================
// BODHI — Main Server Entry Point
// Boots: Hono API + Telegraf Bot + Bridge + Memory
// ============================================================

import * as dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from monorepo root (npm workspaces may set cwd to apps/server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });

import { Agent, ContextEngine, type ConversationMessage } from "@seneca/core";
import { Bridge } from "@seneca/bridge";
import { getDb } from "@seneca/db";
import { sql } from "drizzle-orm";
import { MemoryService, MemoryExtractor, MemoryContextProvider, MemorySynthesizer, InsightGenerator } from "@seneca/memory";
import { TelegramBot } from "@seneca/channel-telegram";
import { Scheduler } from "@seneca/scheduler";
import { NotionService, NotionContextProvider } from "@seneca/notion";
import {
  GoogleAuth,
  GmailService,
  CalendarService,
  GmailContextProvider,
  CalendarContextProvider,
} from "@seneca/google";
import { ProjectKnowledgeProvider } from "@seneca/knowledge";
import { GitHubService, GitHubContextProvider } from "@seneca/github";
import { VercelService, VercelContextProvider } from "@seneca/vercel";
import { SupabaseAwarenessService, SupabaseAwarenessProvider } from "@seneca/supabase-awareness";
import { desc } from "drizzle-orm";
import { briefings } from "@seneca/db";
import { loadConfig } from "./config.js";
import { ConversationService } from "./services/conversation.js";
import { PushService } from "./services/push.js";

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

  // 4a. Supabase free-tier keep-alive: ping every 3 days to prevent auto-pause
  setInterval(async () => {
    try {
      await db.execute(sql`SELECT 1`);
      console.log("[keepalive] Supabase ping OK");
    } catch (err) {
      console.error("[keepalive] Supabase ping failed:", err);
    }
  }, 3 * 24 * 60 * 60 * 1000);

  // 4b. Initialize Conversation Service
  const conversationService = new ConversationService(db);
  console.log("  Conversations: initialized");

  // 5. Initialize Memory System
  const memoryService = new MemoryService(db, config.VOYAGE_API_KEY);
  const memoryExtractor = new MemoryExtractor(memoryService, bridge);
  const memoryProvider = new MemoryContextProvider(memoryService);
  const memorySynthesizer = new MemorySynthesizer(memoryService, bridge);
  const insightGenerator = new InsightGenerator(memoryService);
  console.log("  Memory: initialized (Voyage AI embeddings + synthesizer + insights)");

  // 6. Initialize Notion (optional — workspace context)
  let notionService: NotionService | null = null;
  let notionProvider: NotionContextProvider | null = null;

  if (config.NOTION_API_KEY) {
    notionService = new NotionService({
      apiKey: config.NOTION_API_KEY,
      tasksDatabaseId: config.NOTION_TASKS_DB,
      sessionsDatabaseId: config.NOTION_SESSIONS_DB,
    });
    notionProvider = new NotionContextProvider(notionService);

    const connected = await notionService.ping();
    console.log(`  Notion: ${connected ? "connected" : "FAILED to connect"}`);
  } else {
    console.log("  Notion: skipped (no NOTION_API_KEY)");
  }

  // 6b. Initialize Google (optional — Gmail + Calendar context)
  let googleAuth: GoogleAuth | null = null;
  let gmailService: GmailService | null = null;
  let calendarService: CalendarService | null = null;
  let gmailProvider: GmailContextProvider | null = null;
  let calendarProvider: CalendarContextProvider | null = null;

  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    googleAuth = new GoogleAuth({
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      redirectUri: config.GOOGLE_REDIRECT_URI || `http://localhost:${config.PORT}/api/google/oauth/callback`,
      tokenPath: config.GOOGLE_TOKEN_PATH,
    });

    if (googleAuth.isAuthenticated()) {
      gmailService = new GmailService(googleAuth);
      calendarService = new CalendarService(googleAuth);
      gmailProvider = new GmailContextProvider(gmailService);
      calendarProvider = new CalendarContextProvider(calendarService);

      const gmailOk = await gmailService.ping().catch(() => false);
      const calOk = await calendarService.ping().catch(() => false);
      console.log(`  Gmail: ${gmailOk ? "connected" : "FAILED to connect"}`);
      console.log(`  Calendar: ${calOk ? "connected" : "FAILED to connect"}`);
    } else {
      console.log("  Google: credentials configured but not authenticated");
      console.log(`  Visit http://localhost:${config.PORT}/api/google/auth to connect`);
    }
  } else {
    console.log("  Google: skipped (no GOOGLE_CLIENT_ID)");
  }

  // 6c. Initialize GitHub (optional — commit/PR/issue tracking)
  let githubService: GitHubService | null = null;
  let githubProvider: GitHubContextProvider | null = null;

  if (config.GITHUB_TOKEN) {
    githubService = new GitHubService({
      token: config.GITHUB_TOKEN,
      repos: config.GITHUB_REPOS?.split(",").map((r) => r.trim()),
    });
    githubProvider = new GitHubContextProvider(githubService);

    const connected = await githubService.ping().catch(() => false);
    console.log(`  GitHub: ${connected ? "connected" : "FAILED to connect"}`);
  } else {
    console.log("  GitHub: skipped (no GITHUB_TOKEN)");
  }

  // 6d. Initialize Vercel (optional — deployment tracking)
  let vercelService: VercelService | null = null;
  let vercelProvider: VercelContextProvider | null = null;

  if (config.VERCEL_TOKEN) {
    vercelService = new VercelService({
      token: config.VERCEL_TOKEN,
      projectId: config.VERCEL_PROJECT_ID,
      teamId: config.VERCEL_TEAM_ID,
    });
    vercelProvider = new VercelContextProvider(vercelService);

    const connected = await vercelService.ping().catch(() => false);
    console.log(`  Vercel: ${connected ? "connected" : "FAILED to connect"}`);
  } else {
    console.log("  Vercel: skipped (no VERCEL_TOKEN)");
  }

  // 6e. Initialize Supabase Awareness (optional — project health monitoring)
  let supabaseAwarenessService: SupabaseAwarenessService | null = null;
  let supabaseAwarenessProvider: SupabaseAwarenessProvider | null = null;

  if (config.SUPABASE_ACCESS_TOKEN && config.SUPABASE_PROJECT_REF) {
    supabaseAwarenessService = new SupabaseAwarenessService({
      accessToken: config.SUPABASE_ACCESS_TOKEN,
      projectRef: config.SUPABASE_PROJECT_REF,
    });
    supabaseAwarenessProvider = new SupabaseAwarenessProvider(supabaseAwarenessService);

    const connected = await supabaseAwarenessService.ping().catch(() => false);
    console.log(`  Supabase Awareness: ${connected ? "connected" : "FAILED to connect"}`);
  } else {
    console.log("  Supabase Awareness: skipped (no SUPABASE_ACCESS_TOKEN)");
  }

  // 6f. Initialize Push Notifications (optional — PWA Web Push)
  let pushService: PushService | null = null;

  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT) {
    pushService = new PushService(
      db,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY,
      config.VAPID_SUBJECT,
    );
    console.log("  Push: initialized (VAPID configured)");
  } else {
    console.log("  Push: skipped (no VAPID keys)");
  }

  // 7. Initialize Context Engine
  const contextEngine = new ContextEngine();
  contextEngine.register(memoryProvider);

  // Project Knowledge — reads CLAUDE.md + MEMORY.md from configured projects
  const knowledgeProvider = new ProjectKnowledgeProvider();
  contextEngine.register(knowledgeProvider);

  if (notionProvider) {
    contextEngine.register(notionProvider);
  }
  if (gmailProvider) {
    contextEngine.register(gmailProvider);
  }
  if (calendarProvider) {
    contextEngine.register(calendarProvider);
  }
  if (githubProvider) {
    contextEngine.register(githubProvider);
  }
  if (vercelProvider) {
    contextEngine.register(vercelProvider);
  }
  if (supabaseAwarenessProvider) {
    contextEngine.register(supabaseAwarenessProvider);
  }
  const providerCount = 2 + (notionProvider ? 1 : 0) + (gmailProvider ? 1 : 0) + (calendarProvider ? 1 : 0) + (githubProvider ? 1 : 0) + (vercelProvider ? 1 : 0) + (supabaseAwarenessProvider ? 1 : 0);
  console.log(`  Context: initialized (${providerCount} provider${providerCount > 1 ? "s" : ""}, includes project knowledge)`);

  // 8. Initialize Agent Core (routes through Bridge, not Anthropic API)
  const agent = new Agent(
    {
      persona,
      model: "claude-sonnet-4-5-20250929",
      maxIterations: 10,
      contextBudgetTokens: 8000,
    },
    bridge
  );
  console.log("  Agent: initialized (via Bridge → Max subscription)");

  // 9. Initialize Telegram Bot
  const telegramBot = new TelegramBot({
    token: config.TELEGRAM_BOT_TOKEN,
    allowedUserId: config.TELEGRAM_ALLOWED_USER_ID,
    agent,
    bridge,
    contextEngine,
    memoryService,
    memoryExtractor,
    gmailService: gmailService || undefined,
    calendarService: calendarService || undefined,
    conversationService,
    groqApiKey: config.GROQ_API_KEY,
  });
  console.log(`  Telegram: configured (user ${config.TELEGRAM_ALLOWED_USER_ID})`);

  // 10. Initialize Scheduler (proactive briefings via cron)
  // Create briefing store adapter for persisting to DB
  const briefingStore = {
    async save(type: "morning" | "evening" | "weekly", content: string): Promise<void> {
      await db.insert(briefings).values({ type, content });
    },
  };

  const scheduler = new Scheduler({
    agent,
    telegram: telegramBot,
    memoryService,
    contextEngine,
    timezone: config.TIMEZONE,
    notion: notionService,
    gmail: gmailService,
    calendar: calendarService,
    synthesizer: memorySynthesizer,
    insightGenerator,
    github: githubService,
    vercel: vercelService,
    supabase: supabaseAwarenessService,
    pushSender: pushService,
    briefingStore,
  });
  console.log("  Scheduler: initialized (morning/evening/weekly briefings)");

  // 10. Set up Hono API server
  const app = new Hono();
  const dashboardDistPath = path.resolve(__dirname, "../../../apps/dashboard/dist");
  const hasDashboard = fs.existsSync(dashboardDistPath);

  // CORS for dashboard (Vite dev on port 5173 + optional remote origins + PWA domain)
  const corsOrigins = ["http://localhost:5173", "http://localhost:4000"];
  if (config.PUBLIC_URL) {
    corsOrigins.push(config.PUBLIC_URL);
  }
  if (config.CORS_ORIGINS) {
    corsOrigins.push(...config.CORS_ORIGINS.split(",").map((o) => o.trim()));
  }
  app.use("/*", cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }));

  // Global error handler — return JSON errors instead of HTML
  app.onError((err, c) => {
    console.error(`[api] ${c.req.method} ${c.req.path} error:`, err.message);
    return c.json({ error: err.message }, 500);
  });

  // Root: serve dashboard when built, else JSON health check
  if (!hasDashboard) {
    app.get("/", (c) => {
      return c.json({
        name: "BODHI",
        status: "online",
        version: "0.3.0",
        uptime: process.uptime(),
        bridgeRunning: bridge.isRunning,
        memory: true,
      });
    });
  }

  // Health check with DB connectivity (for Docker HEALTHCHECK / uptime monitors)
  app.get("/health", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: "healthy", db: "connected", uptime: process.uptime() });
    } catch {
      return c.json({ status: "unhealthy", db: "disconnected", uptime: process.uptime() }, 503);
    }
  });

  // API: Chat endpoint (for web/CLI channels later)
  app.post("/api/chat", async (c) => {
    const body = await c.req.json<{ message: string; threadId?: string }>();

    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    // Resolve or create thread
    let threadId = body.threadId;
    let history: ConversationMessage[] = [];

    if (threadId) {
      const turns = await conversationService.getTurns(threadId);
      history = turns.map((t) => ({ role: t.role, content: t.content }));
    } else {
      const thread = await conversationService.createThread("web");
      threadId = thread.id;
      // Auto-set title from first message
      const title = body.message.slice(0, 60) + (body.message.length > 60 ? "..." : "");
      await conversationService.updateTitle(threadId, title);
    }

    // Retrieve relevant context
    const context = await contextEngine.gather(body.message);
    const response = await agent.chat(body.message, context, history);

    // Persist turns
    await conversationService.addTurn(threadId, { role: "user", content: body.message, channel: "web" });
    await conversationService.addTurn(threadId, {
      role: "assistant",
      content: response.content,
      channel: "web",
      modelUsed: response.model,
      durationMs: response.durationMs,
    });
    await conversationService.touchThread(threadId);

    // Extract memories async
    memoryExtractor.extract(body.message, response.content).catch(() => {});

    return c.json({
      threadId,
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
      cwd: body.cwd || config.BODHI_PROJECT_DIR || process.cwd(),
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

  app.post("/api/memories/batch", async (c) => {
    const body = await c.req.json<{
      memories: Array<{
        content: string;
        tags?: string[];
        importance?: number;
        type?: "fact" | "decision" | "pattern" | "preference" | "event";
      }>;
    }>();

    if (!body.memories || !Array.isArray(body.memories) || body.memories.length === 0) {
      return c.json({ error: "memories array is required" }, 400);
    }

    if (body.memories.length > 128) {
      return c.json({ error: "max 128 memories per batch" }, 400);
    }

    const inputs = body.memories.map((m) => ({
      content: m.content,
      tags: m.tags,
      importance: m.importance,
      type: m.type,
      source: "manual" as const,
    }));

    const result = await memoryService.storeBatch(inputs);
    return c.json(result, 201);
  });

  app.delete("/api/memories/:id", async (c) => {
    const id = c.req.param("id");
    await memoryService.forget(id);
    return c.json({ deleted: true });
  });

  app.patch("/api/memories/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ importanceDelta?: number; confidenceDelta?: number }>();

    if (body.importanceDelta !== undefined) {
      await memoryService.adjustImportance([id], body.importanceDelta);
    }
    if (body.confidenceDelta !== undefined) {
      await memoryService.adjustConfidence([id], body.confidenceDelta);
    }

    return c.json({ updated: true });
  });

  app.post("/api/memories/extract", async (c) => {
    const body = await c.req.json<{ userMessage: string; assistantResponse: string }>();
    if (!body.userMessage || !body.assistantResponse) {
      return c.json({ error: "userMessage and assistantResponse are required" }, 400);
    }
    try {
      // extract() stores memories internally and returns void
      await memoryExtractor.extract(body.userMessage, body.assistantResponse);
      return c.json({ extracted: true, message: "Memory extraction triggered. Check server logs for details." });
    } catch (error) {
      console.error("[api] Memory extraction failed:", error);
      return c.json({ extracted: false, message: "Extraction failed — bridge may be unavailable" });
    }
  });

  app.get("/api/memories/insights", async (c) => {
    const insights = await insightGenerator.generate();
    return c.json({ insights });
  });

  app.get("/api/memories/quality", async (c) => {
    const [stale, neglected, frequent, tagTrends, recentRate, totalRate] =
      await Promise.all([
        memoryService.getStaleMemories(30, 0.5),
        memoryService.getNeglectedHighValue(0.7, 0, 14),
        memoryService.getFrequentlyAccessed(5, 20),
        memoryService.getTagTrends(7, 7),
        memoryService.getCreationRate(7),
        memoryService.getCreationRate(14),
      ]);

    return c.json({
      stale,
      neglected,
      frequent,
      tagTrends,
      creationRate: {
        thisWeek: recentRate,
        lastWeek: totalRate - recentRate,
      },
    });
  });

  // API: Streaming chat (SSE)
  app.post("/api/chat/stream", async (c) => {
    const body = await c.req.json<{ message: string; threadId?: string }>();
    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    // Resolve or create thread
    let threadId = body.threadId;
    let history: ConversationMessage[] = [];

    if (threadId) {
      const turns = await conversationService.getTurns(threadId);
      history = turns.map((t) => ({ role: t.role, content: t.content }));
    } else {
      const thread = await conversationService.createThread("web");
      threadId = thread.id;
      const title = body.message.slice(0, 60) + (body.message.length > 60 ? "..." : "");
      await conversationService.updateTitle(threadId, title);
    }

    const context = await contextEngine.gather(body.message);

    return streamSSE(c, async (stream) => {
      // Send threadId as the first event so the client can track it
      await stream.writeSSE({ data: JSON.stringify({ type: "thread", threadId }) });

      const response = await agent.stream(body.message, context, async (chunk) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: chunk }) });
      }, history);

      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          content: response.content,
          model: response.model,
          durationMs: response.durationMs,
          threadId,
        }),
      });

      // Persist turns (don't block SSE close)
      conversationService.addTurn(threadId!, { role: "user", content: body.message, channel: "web" }).catch(() => {});
      conversationService.addTurn(threadId!, {
        role: "assistant",
        content: response.content,
        channel: "web",
        modelUsed: response.model,
        durationMs: response.durationMs,
      }).catch(() => {});
      conversationService.touchThread(threadId!).catch(() => {});

      // Extract memories async (don't block SSE close)
      memoryExtractor.extract(body.message, response.content).catch(() => {});
    });
  });

  // API: Conversations
  app.get("/api/conversations", async (c) => {
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
    const result = await conversationService.listThreads(limit, offset);
    return c.json(result);
  });

  app.get("/api/conversations/:id", async (c) => {
    const id = c.req.param("id");
    const thread = await conversationService.getThread(id);
    if (!thread) {
      return c.json({ error: "Thread not found" }, 404);
    }
    const turns = await conversationService.getTurns(id);
    return c.json({ thread, turns });
  });

  app.delete("/api/conversations/:id", async (c) => {
    const id = c.req.param("id");
    await conversationService.deleteThread(id);
    return c.json({ deleted: true });
  });

  // API: Scheduler
  app.get("/api/scheduler", (c) => {
    return c.json(scheduler.getStatus());
  });

  app.post("/api/scheduler/trigger", async (c) => {
    const body = await c.req.json<{ type: "morning" | "evening" | "weekly" | "synthesis" }>();
    if (!body.type || !["morning", "evening", "weekly", "synthesis"].includes(body.type)) {
      return c.json({ error: "type must be 'morning', 'evening', 'weekly', or 'synthesis'" }, 400);
    }
    const result = await scheduler.trigger(body.type);
    return c.json(result);
  });

  // API: Notion
  app.get("/api/notion/status", async (c) => {
    if (!notionService) {
      return c.json({ connected: false, reason: "NOTION_API_KEY not configured" });
    }
    const connected = await notionService.ping();
    return c.json({
      connected,
      databases: {
        tasks: config.NOTION_TASKS_DB ? true : false,
        sessions: config.NOTION_SESSIONS_DB ? true : false,
      },
    });
  });

  app.get("/api/notion/tasks", async (c) => {
    if (!notionService) {
      return c.json({ error: "Notion not configured" }, 503);
    }
    const filter = (c.req.query("filter") || "active") as "all" | "active" | "todo";
    const tasks = await notionService.getTasks(filter);
    return c.json({ tasks });
  });

  app.get("/api/notion/sessions", async (c) => {
    if (!notionService) {
      return c.json({ error: "Notion not configured" }, 503);
    }
    const limit = parseInt(c.req.query("limit") || "10");
    const sessions = await notionService.getSessions(limit);
    return c.json({ sessions });
  });

  app.get("/api/notion/search", async (c) => {
    if (!notionService) {
      return c.json({ error: "Notion not configured" }, 503);
    }
    const q = c.req.query("q");
    if (!q) {
      return c.json({ error: "q query parameter is required" }, 400);
    }
    const results = await notionService.search(q);
    return c.json({ results });
  });

  // API: Google OAuth + Gmail + Calendar
  app.get("/api/google/auth", (c) => {
    if (!googleAuth) {
      return c.json({ error: "Google not configured (missing GOOGLE_CLIENT_ID)" }, 503);
    }
    const url = googleAuth.getAuthUrl();
    return c.json({ url });
  });

  app.get("/api/google/oauth/callback", async (c) => {
    if (!googleAuth) {
      return c.json({ error: "Google not configured" }, 503);
    }
    const code = c.req.query("code");
    if (!code) {
      return c.json({ error: "Missing authorization code" }, 400);
    }

    try {
      await googleAuth.handleCallback(code);

      // Initialize services now that we're authenticated
      if (!gmailService) {
        gmailService = new GmailService(googleAuth);
        gmailProvider = new GmailContextProvider(gmailService);
        contextEngine.register(gmailProvider);
      }
      if (!calendarService) {
        calendarService = new CalendarService(googleAuth);
        calendarProvider = new CalendarContextProvider(calendarService);
        contextEngine.register(calendarProvider);
      }

      return c.json({ status: "authenticated", gmail: true, calendar: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "OAuth failed" }, 500);
    }
  });

  app.get("/api/gmail/status", async (c) => {
    if (!gmailService) {
      return c.json({ connected: false, reason: googleAuth ? "Not authenticated" : "Not configured" });
    }
    const connected = await gmailService.ping().catch(() => false);
    return c.json({ connected });
  });

  app.get("/api/gmail/inbox", async (c) => {
    if (!gmailService) {
      return c.json({ error: "Gmail not connected" }, 503);
    }
    const limit = parseInt(c.req.query("limit") || "10");
    const emails = await gmailService.getRecent(limit);
    return c.json({ emails });
  });

  app.get("/api/gmail/unread", async (c) => {
    if (!gmailService) {
      return c.json({ error: "Gmail not connected" }, 503);
    }
    const count = await gmailService.getUnreadCount();
    return c.json({ unread: count });
  });

  app.get("/api/gmail/search", async (c) => {
    if (!gmailService) {
      return c.json({ error: "Gmail not connected" }, 503);
    }
    const q = c.req.query("q");
    if (!q) {
      return c.json({ error: "q query parameter is required" }, 400);
    }
    const emails = await gmailService.search(q);
    return c.json({ emails });
  });

  app.get("/api/calendar/status", async (c) => {
    if (!calendarService) {
      return c.json({ connected: false, reason: googleAuth ? "Not authenticated" : "Not configured" });
    }
    const connected = await calendarService.ping().catch(() => false);
    return c.json({ connected });
  });

  app.get("/api/calendar/today", async (c) => {
    if (!calendarService) {
      return c.json({ error: "Calendar not connected" }, 503);
    }
    const events = await calendarService.getTodayEvents();
    return c.json({ events });
  });

  app.get("/api/calendar/upcoming", async (c) => {
    if (!calendarService) {
      return c.json({ error: "Calendar not connected" }, 503);
    }
    const days = parseInt(c.req.query("days") || "7");
    const events = await calendarService.getUpcoming(days);
    return c.json({ events });
  });

  app.get("/api/calendar/free", async (c) => {
    if (!calendarService) {
      return c.json({ error: "Calendar not connected" }, 503);
    }
    const slots = await calendarService.getFreeTime();
    return c.json({ slots });
  });

  // API: GitHub
  app.get("/api/github/status", async (c) => {
    if (!githubService) {
      return c.json({ connected: false, reason: "GITHUB_TOKEN not configured" });
    }
    const connected = await githubService.ping().catch(() => false);
    return c.json({ connected });
  });

  app.get("/api/github/activity", async (c) => {
    if (!githubService) {
      return c.json({ error: "GitHub not configured" }, 503);
    }
    const activity = await githubService.getActivity();
    return c.json(activity);
  });

  app.get("/api/github/commits", async (c) => {
    if (!githubService) {
      return c.json({ error: "GitHub not configured" }, 503);
    }
    const limit = parseInt(c.req.query("limit") || "20");
    const commits = await githubService.getRecentCommits(limit);
    return c.json({ commits });
  });

  app.get("/api/github/prs", async (c) => {
    if (!githubService) {
      return c.json({ error: "GitHub not configured" }, 503);
    }
    const prs = await githubService.getOpenPRs();
    return c.json({ prs });
  });

  app.get("/api/github/issues", async (c) => {
    if (!githubService) {
      return c.json({ error: "GitHub not configured" }, 503);
    }
    const issues = await githubService.getRecentIssues();
    return c.json({ issues });
  });

  // API: Vercel
  app.get("/api/vercel/status", async (c) => {
    if (!vercelService) {
      return c.json({ connected: false, reason: "VERCEL_TOKEN not configured" });
    }
    const connected = await vercelService.ping().catch(() => false);
    return c.json({ connected });
  });

  app.get("/api/vercel/deployments", async (c) => {
    if (!vercelService) {
      return c.json({ error: "Vercel not configured" }, 503);
    }
    const limit = parseInt(c.req.query("limit") || "10");
    const deployments = await vercelService.getDeployments(limit);
    return c.json({ deployments });
  });

  // API: Supabase Awareness
  app.get("/api/supabase/status", async (c) => {
    if (!supabaseAwarenessService) {
      return c.json({ connected: false, reason: "SUPABASE_ACCESS_TOKEN not configured" });
    }
    const connected = await supabaseAwarenessService.ping().catch(() => false);
    return c.json({ connected });
  });

  app.get("/api/supabase/health", async (c) => {
    if (!supabaseAwarenessService) {
      return c.json({ error: "Supabase Awareness not configured" }, 503);
    }
    const data = await supabaseAwarenessService.getRecentActivity();
    return c.json(data);
  });

  // ---- Push Notification Endpoints ----

  app.get("/api/push/vapid-key", (c) => {
    if (!config.VAPID_PUBLIC_KEY) {
      return c.json({ publicKey: null });
    }
    return c.json({ publicKey: config.VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", async (c) => {
    if (!pushService) {
      return c.json({ error: "Push not configured" }, 503);
    }
    const body = await c.req.json<{
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }>();
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return c.json({ error: "Invalid push subscription" }, 400);
    }
    const userAgent = c.req.header("user-agent") || undefined;
    await pushService.subscribe(body, userAgent);
    return c.json({ ok: true });
  });

  app.post("/api/push/unsubscribe", async (c) => {
    if (!pushService) {
      return c.json({ error: "Push not configured" }, 503);
    }
    const body = await c.req.json<{ endpoint: string }>();
    if (!body.endpoint) {
      return c.json({ error: "endpoint is required" }, 400);
    }
    await pushService.unsubscribe(body.endpoint);
    return c.json({ ok: true });
  });

  app.get("/api/push/status", async (c) => {
    if (!pushService) {
      return c.json({ configured: false, subscribers: 0 });
    }
    const count = await pushService.getSubscriptionCount();
    return c.json({ configured: true, subscribers: count });
  });

  // ---- Briefings Feed ----

  app.get("/api/briefings", async (c) => {
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
    const type = c.req.query("type") as "morning" | "evening" | "weekly" | undefined;

    let query = db
      .select()
      .from(briefings)
      .orderBy(desc(briefings.createdAt))
      .limit(limit)
      .offset(offset);

    if (type) {
      const { eq } = await import("drizzle-orm");
      query = query.where(eq(briefings.type, type)) as typeof query;
    }

    const results = await query;
    return c.json({ briefings: results, limit, offset });
  });

  // API: Status
  app.get("/api/status", (c) => {
    return c.json({
      agent: "online",
      bridge: bridge.isRunning ? "running" : "idle",
      memory: "active",
      notion: notionService ? "connected" : "not configured",
      github: githubService ? "connected" : "not configured",
      vercel: vercelService ? "connected" : "not configured",
      supabase: supabaseAwarenessService ? "connected" : "not configured",
      push: pushService ? "configured" : "not configured",
      gmail: gmailService ? "connected" : googleAuth ? "not authenticated" : "not configured",
      calendar: calendarService ? "connected" : googleAuth ? "not authenticated" : "not configured",
      scheduler: scheduler.getStatus().running ? "running" : "stopped",
      uptime: process.uptime(),
      ownerName: config.BODHI_OWNER_NAME,
      channels: {
        telegram: "connected",
        web: "available",
        cli: "available",
      },
    });
  });

  // === Static Dashboard Serving ===
  if (hasDashboard) {
    console.log(`  Dashboard: serving static build from ${dashboardDistPath}`);

    // serveStatic root is relative to CWD; when started via workspace,
    // CWD = apps/server/ — use relative path to dashboard dist
    const staticRoot = path.relative(process.cwd(), dashboardDistPath);

    app.use(
      "/assets/*",
      serveStatic({
        root: staticRoot,
        onFound: (_path, c) => {
          c.header("Cache-Control", "public, immutable, max-age=31536000");
        },
      })
    );

    // PWA: manifest, icons, service worker
    app.use(
      "/icons/*",
      serveStatic({
        root: staticRoot,
        onFound: (_path, c) => {
          c.header("Cache-Control", "public, max-age=86400");
        },
      })
    );
    app.use(
      "/manifest.json",
      serveStatic({ root: staticRoot })
    );
    app.use(
      "/sw.js",
      serveStatic({
        root: staticRoot,
        onFound: (_path, c) => {
          c.header("Cache-Control", "no-cache");
          c.header("Service-Worker-Allowed", "/");
        },
      })
    );
    app.use(
      "/registerSW.js",
      serveStatic({ root: staticRoot })
    );

    // SPA fallback: serve index.html for any non-API, non-asset route
    app.get("*", (c) => {
      const html = fs.readFileSync(path.join(dashboardDistPath, "index.html"), "utf-8");
      return c.html(html);
    });
  } else {
    console.log("  Dashboard: no static build found (dev mode — use Vite on :5173)");
  }

  // 11. Start everything
  console.log("\n  Starting services...");

  // Start Hono API server
  serve({ fetch: app.fetch, port: config.PORT }, () => {
    console.log(`  API server: http://localhost:${config.PORT}`);
  });

  // Start Scheduler (cron jobs — doesn't depend on Telegram being ready)
  scheduler.start();

  // Start Telegram bot (non-blocking — launch() never resolves during long-polling)
  telegramBot.start().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Telegram: FAILED to start — ${msg}`);
    console.error("  (Server continues without Telegram)");
  });

  console.log("\n🌳  BODHI is online.\n");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🌳  BODHI shutting down...");
    scheduler.stop();
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
