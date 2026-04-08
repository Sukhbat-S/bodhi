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
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from monorepo root (npm workspaces may set cwd to apps/server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });

import { Agent, ContextEngine, SelfAssessor, type AIBackend, type ConversationMessage } from "@seneca/core";
import { Bridge } from "@seneca/bridge";
import { AnthropicBackend } from "@seneca/anthropic";
import { getDb } from "@seneca/db";
import { sql } from "drizzle-orm";
import { MemoryService, MemoryExtractor, MemoryContextProvider, MemorySynthesizer, InsightGenerator, EntityService, EntityBackfill, EntityContextProvider, GoalContextProvider } from "@seneca/memory";
import { TelegramBot } from "@seneca/channel-telegram";
import { Scheduler, workflowRegistry } from "@seneca/scheduler";
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
import { MetaService } from "@seneca/social";
import { desc } from "drizzle-orm";
import { briefings, activeSessions as activeSessionsTable, sessionMessages as sessionMessagesTable, contentQueue } from "@seneca/db";
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

  // 3. Initialize AI Backend — Bridge (Claude Code CLI) or Anthropic API
  let backend: AIBackend;
  if (config.ANTHROPIC_API_KEY) {
    backend = new AnthropicBackend(config.ANTHROPIC_API_KEY);
    console.log("  Backend: Anthropic API (direct)");
  } else {
    backend = new Bridge();
    console.log("  Backend: Bridge (Claude Code CLI via Max subscription)");
  }

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
  const entityService = new EntityService(db);
  const entityBackfill = new EntityBackfill(db, backend, entityService);
  const memoryExtractor = new MemoryExtractor(memoryService, backend, entityService);
  const memoryProvider = new MemoryContextProvider(memoryService);
  const memorySynthesizer = new MemorySynthesizer(memoryService, backend, db);
  const insightGenerator = new InsightGenerator(memoryService);
  console.log("  Memory: initialized (Voyage AI embeddings + entities + synthesizer + insights)");

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

  // 6f. Initialize Meta / Social (optional — Facebook + Instagram posting)
  let metaService: MetaService | null = null;

  if (config.META_PAGE_ACCESS_TOKEN && config.META_PAGE_ID) {
    metaService = new MetaService({
      pageId: config.META_PAGE_ID,
      pageAccessToken: config.META_PAGE_ACCESS_TOKEN,
      instagramAccountId: config.META_INSTAGRAM_ACCOUNT_ID,
    });

    const connected = await metaService.ping().catch(() => false);
    console.log(`  Meta: ${connected ? "connected" : "FAILED to connect"}`);
  } else {
    console.log("  Meta: skipped (no META_PAGE_ACCESS_TOKEN)");
  }

  // 6g. Initialize Push Notifications (optional — PWA Web Push)
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
  const entityProvider = new EntityContextProvider(entityService);
  contextEngine.register(entityProvider);
  const goalProvider = new GoalContextProvider(memoryService);
  contextEngine.register(goalProvider);
  const providerCount = 3 + (notionProvider ? 1 : 0) + (gmailProvider ? 1 : 0) + (calendarProvider ? 1 : 0) + (githubProvider ? 1 : 0) + (vercelProvider ? 1 : 0) + (supabaseAwarenessProvider ? 1 : 0);
  console.log(`  Context: initialized (${providerCount} provider${providerCount > 1 ? "s" : ""}, includes project knowledge)`);

  // 8. Initialize Agent Core (routes through Bridge, not Anthropic API)
  const agent = new Agent(
    {
      persona,
      model: "claude-sonnet-4-5-20250929",
      maxIterations: 10,
      contextBudgetTokens: 8000,
    },
    backend
  );
  console.log(`  Agent: initialized (via ${config.ANTHROPIC_API_KEY ? "Anthropic API" : "Bridge → Max subscription"})`);

  // 8b. Self-Assessor (env-gated)
  const selfAssessor = process.env.BODHI_SELF_ASSESS === "true"
    ? new SelfAssessor(backend)
    : null;
  if (selfAssessor) console.log("  SelfAssessor: enabled (BODHI_SELF_ASSESS=true)");

  // 9. Initialize Telegram Bot (optional — skipped if no token)
  const telegramBot = config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_ALLOWED_USER_ID
    ? new TelegramBot({
        token: config.TELEGRAM_BOT_TOKEN,
        allowedUserId: config.TELEGRAM_ALLOWED_USER_ID,
        agent,
        bridge: backend,
        contextEngine,
        memoryService,
        memoryExtractor,
        gmailService: gmailService || undefined,
        calendarService: calendarService || undefined,
        conversationService,
        groqApiKey: config.GROQ_API_KEY,
      })
    : null;
  if (telegramBot) {
    console.log(`  Telegram: configured (user ${config.TELEGRAM_ALLOWED_USER_ID})`);
  } else {
    console.log("  Telegram: skipped (no TELEGRAM_BOT_TOKEN)");
  }

  // 10. Initialize Scheduler (proactive briefings via cron)
  // Create briefing store adapter for persisting to DB
  const briefingStore = {
    async save(type: "morning" | "evening" | "weekly" | "daily-intel" | "jewelry-changelog", content: string): Promise<void> {
      await db.insert(briefings).values({ type: type as any, content });
    },
  };

  const contentStore = {
    async getNextLesson(): Promise<number> {
      const rows = await db.select({ lessonNumber: contentQueue.lessonNumber })
        .from(contentQueue)
        .orderBy(sql`${contentQueue.lessonNumber} DESC`)
        .limit(1);
      return rows.length > 0 ? rows[0].lessonNumber + 1 : 1;
    },
    async insert(item: { lessonNumber: number; topic: string; slides: unknown[]; caption: string }): Promise<string> {
      const rows = await db.insert(contentQueue).values({
        lessonNumber: item.lessonNumber,
        topic: item.topic,
        slides: item.slides as any,
        caption: item.caption,
      }).returning({ id: contentQueue.id });
      return rows[0].id;
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
    entityService,
    workflows: workflowRegistry,
    personaPath,
    metaService,
    contentStore,
  });
  console.log("  Scheduler: initialized (morning/evening/weekly briefings + workflows)");

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
        bridgeRunning: "isRunning" in backend ? (backend as Bridge).isRunning : false,
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

    // Onboarding: if this is a new user with very few memories, inject warmth
    if (history.length === 0) {
      const stats = await memoryService.getStats().catch(() => ({ totalMemories: 999 }));
      if (stats.totalMemories < 5) {
        context.fragments.unshift({
          provider: "onboarding",
          content: `This is a NEW user with almost no memories yet. This may be their first conversation with BODHI. Be warm and curious — ask what they're working on, what matters to them right now, and what they'd like BODHI to remember. Make the first interaction feel like meeting a thoughtful friend, not a tool. Don't overwhelm with features. Just be present and learn about them.`,
          tokenEstimate: 80,
          relevance: 1,
        });
      }
    }

    const response = await agent.chat(body.message, context, history);

    // Build compact context snapshot for feedback-synthesis tracing
    const snapshot = {
      memoryIds: context.fragments.flatMap((f) => f.metadata?.memoryIds ?? []),
      providers: context.fragments.map((f) => f.provider),
    };

    // Persist turns
    await conversationService.addTurn(threadId, { role: "user", content: body.message, channel: "web" });
    await conversationService.addTurn(threadId, {
      role: "assistant",
      content: response.content,
      channel: "web",
      modelUsed: response.model,
      durationMs: response.durationMs,
      contextSnapshot: snapshot,
    });
    await conversationService.touchThread(threadId);

    // Extract memories async
    memoryExtractor.extract(body.message, response.content, threadId).catch(() => {});

    // Self-assess async (don't block response)
    if (selfAssessor) {
      conversationService.getLastAssistantTurnId(threadId).then((turnId) => {
        if (!turnId) return;
        selfAssessor.assess(body.message, response.content).then((assessment) => {
          conversationService.setSelfAssessment(turnId, assessment);
        });
      }).catch(() => {});
    }

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

    const task = await backend.execute(body.prompt, {
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
    const type = c.req.query("type") || undefined;

    const result = await memoryService.listFiltered({ limit, offset, tag, search, type });
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

  // ---- Pending Memories API ----

  app.get("/api/memories/pending", async (c) => {
    const limit = Number(c.req.query("limit")) || 20;
    const memories = await memoryService.getPendingMemories(limit);
    const count = await memoryService.getPendingCount();
    return c.json({ memories, count });
  });

  app.get("/api/memories/pending/count", async (c) => {
    const count = await memoryService.getPendingCount();
    return c.json({ count });
  });

  app.post("/api/memories/:id/confirm", async (c) => {
    const confirmed = await memoryService.confirmMemory(c.req.param("id"));
    if (!confirmed) return c.json({ error: "Memory not found or not pending" }, 404);
    return c.json({ confirmed: true });
  });

  app.post("/api/memories/:id/reject", async (c) => {
    const rejected = await memoryService.rejectMemory(c.req.param("id"));
    if (!rejected) return c.json({ error: "Memory not found or not pending" }, 404);
    return c.json({ rejected: true });
  });

  // ---- Entity Graph API ----

  app.get("/api/entities", async (c) => {
    const type = c.req.query("type");
    const search = c.req.query("search");
    const limit = Number(c.req.query("limit")) || 20;
    const offset = Number(c.req.query("offset")) || 0;
    const result = await entityService.list({ type: type || undefined, search: search || undefined, limit, offset });
    return c.json(result);
  });

  app.get("/api/entities/stats", async (c) => {
    const stats = await entityService.getStats();
    return c.json(stats);
  });

  app.get("/api/entities/graph", async (c) => {
    const graph = await entityService.getGraph();
    return c.json(graph);
  });

  app.get("/api/entities/:id", async (c) => {
    const entity = await entityService.getEntity(c.req.param("id"));
    if (!entity) return c.json({ error: "Entity not found" }, 404);
    return c.json(entity);
  });

  app.get("/api/entities/:id/memories", async (c) => {
    const limit = Number(c.req.query("limit")) || 20;
    const memories = await entityService.getEntityMemories(c.req.param("id"), limit);
    return c.json({ memories });
  });

  app.post("/api/entities", async (c) => {
    const body = await c.req.json<{ name: string; type: string; description?: string; aliases?: string[] }>();
    if (!body.name || !body.type) return c.json({ error: "name and type required" }, 400);
    const entity = await entityService.findOrCreate(body.name, body.type as any, body.aliases);
    if (body.description) {
      await entityService.update(entity.id, { description: body.description });
    }
    return c.json(entity, 201);
  });

  app.patch("/api/entities/:id", async (c) => {
    const body = await c.req.json<{ name?: string; description?: string; aliases?: string[]; type?: string }>();
    const updated = await entityService.update(c.req.param("id"), body as any);
    if (!updated) return c.json({ error: "Entity not found" }, 404);
    return c.json(updated);
  });

  app.delete("/api/entities/:id", async (c) => {
    await entityService.remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/entities/:id/merge", async (c) => {
    const body = await c.req.json<{ mergeId: string }>();
    if (!body.mergeId) return c.json({ error: "mergeId required" }, 400);
    await entityService.merge(c.req.param("id"), body.mergeId);
    return c.json({ ok: true });
  });

  app.post("/api/entities/backfill", async (c) => {
    if (entityBackfill.isRunning()) {
      return c.json({ error: "Backfill already running" }, 409);
    }
    // Run in background — don't block the request
    entityBackfill.run().then((result) => {
      console.log(`[entities] Backfill complete:`, result);
    }).catch((err) => {
      console.error("[entities] Backfill failed:", err instanceof Error ? err.message : err);
    });
    return c.json({ status: "started" });
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

    // Onboarding: warmth for new users
    if (history.length === 0) {
      const stats = await memoryService.getStats().catch(() => ({ totalMemories: 999 }));
      if (stats.totalMemories < 5) {
        context.fragments.unshift({
          provider: "onboarding",
          content: `This is a NEW user with almost no memories yet. This may be their first conversation with BODHI. Be warm and curious — ask what they're working on, what matters to them right now, and what they'd like BODHI to remember. Make the first interaction feel like meeting a thoughtful friend, not a tool. Don't overwhelm with features. Just be present and learn about them.`,
          tokenEstimate: 80,
          relevance: 1,
        });
      }
    }

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
      const streamSnapshot = {
        memoryIds: context.fragments.flatMap((f) => f.metadata?.memoryIds ?? []),
        providers: context.fragments.map((f) => f.provider),
      };

      conversationService.addTurn(threadId!, { role: "user", content: body.message, channel: "web" }).catch(() => {});
      conversationService.addTurn(threadId!, {
        role: "assistant",
        content: response.content,
        channel: "web",
        modelUsed: response.model,
        durationMs: response.durationMs,
        contextSnapshot: streamSnapshot,
      }).catch(() => {});
      conversationService.touchThread(threadId!).catch(() => {});

      // Extract memories async (don't block SSE close)
      memoryExtractor.extract(body.message, response.content, threadId!).catch(() => {});

      // Self-assess async
      if (selfAssessor) {
        setTimeout(async () => {
          try {
            const turnId = await conversationService.getLastAssistantTurnId(threadId!);
            if (!turnId) return;
            const assessment = await selfAssessor.assess(body.message, response.content);
            await conversationService.setSelfAssessment(turnId, assessment);
          } catch { /* non-fatal */ }
        }, 2000); // Small delay to let turns persist first
      }
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

  app.patch("/api/conversations/:threadId/turns/:turnId/feedback", async (c) => {
    const { turnId } = c.req.param() as { threadId: string; turnId: string };
    const body = await c.req.json<{ rating: "helpful" | "unhelpful"; text?: string }>();
    if (!body.rating || !["helpful", "unhelpful"].includes(body.rating)) {
      return c.json({ error: "rating must be 'helpful' or 'unhelpful'" }, 400);
    }
    const updated = await conversationService.setFeedback(turnId, {
      rating: body.rating,
      text: body.text,
    });
    return c.json({ updated });
  });

  // API: Scheduler
  app.get("/api/scheduler", (c) => {
    return c.json(scheduler.getStatus());
  });

  app.post("/api/scheduler/trigger", async (c) => {
    const body = await c.req.json<{ type: string; workflowId?: string }>();
    const validTypes = ["morning", "evening", "weekly", "synthesis", "inbox-triage", "workflow", "persona-refresh", "daily-intel", "jewelry-changelog", "content-generate", "messenger-intel"];
    if (!body.type || !validTypes.includes(body.type)) {
      return c.json({ error: `type must be one of: ${validTypes.join(", ")}` }, 400);
    }
    if (body.type === "workflow" && !body.workflowId) {
      return c.json({ error: "workflowId required for workflow trigger" }, 400);
    }
    const result = await scheduler.trigger(
      body.type as any,
      body.workflowId
    );
    return c.json(result);
  });

  // API: Active Sessions (DB-backed, survives server restarts)
  // Event bus for real-time SSE push to dashboard
  const sessionBus = new EventEmitter();
  sessionBus.setMaxListeners(50);

  // Auto-expire stale sessions (5 min) and messages (1h)
  let cleanupRunning = false;
  async function cleanupStaleSessions() {
    if (cleanupRunning) return;
    cleanupRunning = true;
    try {
      const sessionCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // SELECT first so we can emit SSE events for each expired session
      const stale = await db.select({ id: activeSessionsTable.id })
        .from(activeSessionsTable)
        .where(sql`${activeSessionsTable.lastPingAt} < ${sessionCutoff}`);
      if (stale.length > 0) {
        await db.delete(activeSessionsTable).where(sql`${activeSessionsTable.lastPingAt} < ${sessionCutoff}`);
        for (const s of stale) {
          sessionBus.emit("event", { type: "session:deregistered", sessionId: s.id });
        }
        console.log(`[session-cleanup] Expired ${stale.length} stale session(s): ${stale.map((s) => s.id).join(", ")}`);
      }
      const msgCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await db.delete(sessionMessagesTable).where(sql`${sessionMessagesTable.createdAt} < ${msgCutoff}`);
    } catch (err) {
      console.error("[session-cleanup]", err instanceof Error ? err.message : err);
    } finally {
      cleanupRunning = false;
    }
  }
  // Run immediately on startup, then every 30s
  cleanupStaleSessions();
  setInterval(cleanupStaleSessions, 30_000);

  app.get("/api/sessions/active", async (c) => {
    const sessions = await db.select().from(activeSessionsTable).orderBy(activeSessionsTable.startedAt);
    return c.json({ sessions });
  });

  app.post("/api/sessions/active", async (c) => {
    const body = await c.req.json();
    const id = body.id || crypto.randomUUID();
    const now = new Date();
    // Upsert: if same ID exists, update it instead of duplicating
    await db.insert(activeSessionsTable)
      .values({ id, project: body.project || "unknown", description: body.description || "", startedAt: now, lastPingAt: now })
      .onConflictDoUpdate({
        target: activeSessionsTable.id,
        set: { project: body.project || "unknown", description: body.description || "", lastPingAt: now },
      });
    sessionBus.emit("event", { type: "session:registered", session: { id, project: body.project || "unknown", description: body.description || "" } });
    return c.json({ id, registered: true });
  });

  app.post("/api/sessions/active/:id/ping", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { lastPingAt: new Date() };
    if (body.description) updates.description = body.description;
    if (body.currentFile !== undefined) updates.currentFile = body.currentFile;
    await db.update(activeSessionsTable)
      .set(updates)
      .where(sql`${activeSessionsTable.id} = ${id}`);
    sessionBus.emit("event", { type: "session:pinged", sessionId: id, currentFile: body.currentFile ?? null });
    return c.json({ pinged: true });
  });

  app.delete("/api/sessions/active/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(activeSessionsTable).where(sql`${activeSessionsTable.id} = ${id}`);
    sessionBus.emit("event", { type: "session:deregistered", sessionId: id });
    return c.json({ deregistered: true });
  });

  // Inter-session messaging
  app.post("/api/sessions/messages", async (c) => {
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch { body = {}; }
    if (!body.from || !body.message) {
      return c.json({ error: "from and message are required" }, 400);
    }
    if (typeof body.message === "string" && body.message.length > 2000) {
      return c.json({ error: "message too long (max 2000 chars)" }, 400);
    }
    const [inserted] = await db.insert(sessionMessagesTable).values({
      fromSession: String(body.from),
      toSession: body.to ? String(body.to) : null,
      message: String(body.message),
    }).returning();
    sessionBus.emit("event", {
      type: "message:sent",
      message: { id: inserted.id, from: inserted.fromSession, to: inserted.toSession, message: inserted.message, createdAt: inserted.createdAt.toISOString() },
    });
    return c.json({ sent: true });
  });

  app.get("/api/sessions/messages", async (c) => {
    const since = c.req.query("since");
    const sessionId = c.req.query("for");
    const whereClause = since
      ? sql`${sessionMessagesTable.createdAt} > ${new Date(since)}`
      : sql`1=1`;
    const messages = await db.select().from(sessionMessagesTable)
      .where(whereClause)
      .orderBy(sessionMessagesTable.createdAt);
    const filtered = sessionId
      ? messages.filter((m) => !m.toSession || m.toSession === sessionId)
      : messages;
    return c.json({ messages: filtered });
  });

  // File ownership — which sessions are editing which files
  app.get("/api/sessions/files", async (c) => {
    const sessions = await db.select().from(activeSessionsTable);
    const files = sessions
      .filter((s) => s.currentFile)
      .map((s) => ({ session: s.id, project: s.project, file: s.currentFile, since: s.lastPingAt }));
    return c.json({ files });
  });

  // SSE stream — real-time session/message updates to dashboard
  app.get("/api/sessions/stream", (c) => {
    return streamSSE(c, async (stream) => {
      // Send initial snapshot
      const sessions = await db.select().from(activeSessionsTable).orderBy(activeSessionsTable.startedAt);
      const messages = await db.select().from(sessionMessagesTable).orderBy(sessionMessagesTable.createdAt);
      const files = sessions.filter((s) => s.currentFile).map((s) => ({ session: s.id, project: s.project, file: s.currentFile, since: s.lastPingAt }));
      await stream.writeSSE({ event: "init", data: JSON.stringify({ sessions, messages, files }) });

      // Forward bus events to this SSE client
      const onEvent = async (event: Record<string, unknown>) => {
        try { await stream.writeSSE({ event: event.type as string, data: JSON.stringify(event) }); } catch { /* disconnected */ }
      };
      sessionBus.on("event", onEvent);

      // Heartbeat keeps proxies from closing
      const heartbeat = setInterval(async () => {
        try { await stream.writeSSE({ event: "heartbeat", data: "" }); } catch { clearInterval(heartbeat); }
      }, 30_000);

      // Block until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          sessionBus.off("event", onEvent);
          clearInterval(heartbeat);
          resolve();
        });
      });
    });
  });

  // API: Workflows
  app.get("/api/workflows", (c) => {
    return c.json({ workflows: scheduler.getWorkflows() });
  });

  app.post("/api/workflows/:id/run", async (c) => {
    const id = c.req.param("id");
    const definition = workflowRegistry.get(id);
    if (!definition) {
      return c.json({ error: `Unknown workflow: ${id}` }, 404);
    }

    return streamSSE(c, async (stream) => {
      // Send workflow metadata first
      await stream.writeSSE({
        data: JSON.stringify({
          type: "start",
          workflowId: definition.id,
          name: definition.name,
          steps: definition.steps.map((s) => s.name),
          totalSteps: definition.steps.length,
        }),
      });

      const context = await contextEngine.gather(definition.name);

      const result = await agent.runWorkflow(
        definition,
        context,
        // onProgress: step status updates
        async (progress) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "progress", ...progress }),
          });
        },
        0,
        [],
        // onStepDone: step completed with output
        async (stepOutput) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "step_complete", ...stepOutput }),
          });
        }
      );

      // Send final result
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          status: result.status,
          totalDurationMs: result.totalDurationMs,
          error: result.error,
        }),
      });

      // Send briefing to Telegram (skip raw JSON steps)
      if (result.status === "completed") {
        const briefingStep = result.steps.find((s) => s.stepName === "generate-briefing");
        const sendStep = briefingStep || result.steps.filter((s) => !s.skipped && !s.output.startsWith("[{")).pop();
        if (sendStep) {
          telegramBot?.sendProactiveMessage(sendStep.output).catch(() => {});
        }

        // Create calendar events from time-blocks step
        if (calendarService) {
          const timeBlockStep = result.steps.find((s) => s.stepName === "create-time-blocks");
          if (timeBlockStep && !timeBlockStep.skipped) {
            try {
              const match = timeBlockStep.output.match(/\[[\s\S]*\]/);
              if (match) {
                const events = JSON.parse(match[0]) as { summary: string; start: string; end: string; description?: string }[];
                for (const event of events) {
                  if (event.summary && event.start && event.end) {
                    await calendarService.createEvent(event);
                  }
                }
                console.log(`[workflows] Created ${events.length} calendar events from SSE endpoint`);
              }
            } catch (err) {
              console.error("[workflows] Calendar creation failed:", err instanceof Error ? err.message : err);
            }
          }
        }
      }
    });
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

  // API: Gmail Actions (write)
  app.post("/api/gmail/draft", async (c) => {
    if (!gmailService) {
      return c.json({ error: "Gmail not connected" }, 503);
    }
    const body = await c.req.json();
    if (!body.to || !body.subject || !body.body) {
      return c.json({ error: "Missing required fields: to, subject, body" }, 400);
    }
    const result = await gmailService.createDraft(body);
    return c.json(result);
  });

  app.post("/api/gmail/draft/:id/send", async (c) => {
    if (!gmailService) {
      return c.json({ error: "Gmail not connected" }, 503);
    }
    const result = await gmailService.sendDraft(c.req.param("id"));
    return c.json(result);
  });

  app.get("/api/gmail/message/:id/body", async (c) => {
    if (!gmailService) {
      return c.json({ error: "Gmail not connected" }, 503);
    }
    const body = await gmailService.getMessageBody(c.req.param("id"));
    return c.json({ body });
  });

  // API: Gmail Organization (bulk ops, labels, filters)
  app.post("/api/gmail/batch/read", async (c) => {
    if (!gmailService) return c.json({ error: "Gmail not connected" }, 503);
    const { query, maxResults } = await c.req.json();
    if (!query) return c.json({ error: "Missing query" }, 400);
    const count = await gmailService.searchAndMarkRead(query, maxResults || 5000);
    return c.json({ success: true, count, query });
  });

  app.post("/api/gmail/batch/archive", async (c) => {
    if (!gmailService) return c.json({ error: "Gmail not connected" }, 503);
    const { query, maxResults } = await c.req.json();
    if (!query) return c.json({ error: "Missing query" }, 400);
    const count = await gmailService.searchAndArchive(query, maxResults || 5000);
    return c.json({ success: true, count, query });
  });

  app.get("/api/gmail/labels", async (c) => {
    if (!gmailService) return c.json({ error: "Gmail not connected" }, 503);
    const labels = await gmailService.getLabels();
    return c.json({ labels });
  });

  app.post("/api/gmail/labels", async (c) => {
    if (!gmailService) return c.json({ error: "Gmail not connected" }, 503);
    const { name } = await c.req.json();
    if (!name) return c.json({ error: "Missing label name" }, 400);
    const id = await gmailService.createLabel(name);
    return c.json({ id, name });
  });

  app.post("/api/gmail/filters", async (c) => {
    if (!gmailService) return c.json({ error: "Gmail not connected" }, 503);
    const { criteria, actions } = await c.req.json();
    if (!criteria) return c.json({ error: "Missing criteria" }, 400);
    const id = await gmailService.createFilter(criteria, actions || {});
    return c.json({ id });
  });

  // API: Calendar Actions (write)
  app.post("/api/calendar/events", async (c) => {
    if (!calendarService) {
      return c.json({ error: "Calendar not connected" }, 503);
    }
    const body = await c.req.json();
    if (!body.summary || !body.start || !body.end) {
      return c.json({ error: "Missing required fields: summary, start, end" }, 400);
    }
    const result = await calendarService.createEvent(body);
    return c.json(result);
  });

  app.patch("/api/calendar/events/:id", async (c) => {
    if (!calendarService) {
      return c.json({ error: "Calendar not connected" }, 503);
    }
    const body = await c.req.json();
    const result = await calendarService.updateEvent(c.req.param("id"), body);
    return c.json(result);
  });

  app.delete("/api/calendar/events/:id", async (c) => {
    if (!calendarService) {
      return c.json({ error: "Calendar not connected" }, 503);
    }
    await calendarService.deleteEvent(c.req.param("id"));
    return c.json({ success: true });
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

  // API: Social / Meta
  app.get("/api/social/status", async (c) => {
    if (!metaService) {
      return c.json({ connected: false, reason: "META_PAGE_ACCESS_TOKEN not configured" });
    }
    const connected = await metaService.ping().catch(() => false);
    return c.json({ connected });
  });

  app.post("/api/post", async (c) => {
    const body = await c.req.json<{ content: string; platforms?: string[]; imageUrl?: string }>();
    const { content, platforms, imageUrl } = body;

    if (!content) {
      return c.json({ error: "content is required" }, 400);
    }

    // Use Bridge (via Agent) to adapt content for each platform
    const adaptPrompt = `You are a social media content adapter. Given the following content idea, create platform-adapted versions.

Content: "${content}"

Create 3 versions:
1. **Twitter/X** (English): Engaging, max 280 characters. No hashtags unless they add value. Punchy and authentic.
2. **Facebook** (Mongolian): Natural conversational tone for a Page post. Can be longer. Written in Mongolian language.
3. **Instagram** (Mongolian): Caption style with relevant hashtags at the end. Written in Mongolian language.

Return ONLY valid JSON (no markdown, no code fences):
{"twitter": "...", "facebook": "...", "instagram": "..."}`;

    let adaptedContent = { twitter: content, facebook: content, instagram: content };

    try {
      const response = await agent.chat(adaptPrompt);
      // Extract JSON from response (may have markdown fences)
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        adaptedContent = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("[post] Failed to adapt content:", err instanceof Error ? err.message : err);
      // Fall back to raw content for all platforms
    }

    const results: Array<{ platform: string; success: boolean; postId?: string; postUrl?: string; error?: string }> = [];
    const targetPlatforms = platforms || ["twitter", "facebook", "instagram"];

    // Post to Facebook
    if (targetPlatforms.includes("facebook") && metaService) {
      const fbResult = await metaService.postToPage(adaptedContent.facebook, { imageUrl });
      results.push(fbResult);
    } else if (targetPlatforms.includes("facebook") && !metaService) {
      results.push({ platform: "facebook", success: false, error: "Meta not configured" });
    }

    // Post to Instagram (requires imageUrl)
    if (targetPlatforms.includes("instagram") && metaService && imageUrl) {
      const igResult = await metaService.postToInstagram(adaptedContent.instagram, imageUrl);
      results.push(igResult);
    } else if (targetPlatforms.includes("instagram") && !imageUrl) {
      results.push({ platform: "instagram", success: false, error: "imageUrl required for Instagram" });
    } else if (targetPlatforms.includes("instagram") && !metaService) {
      results.push({ platform: "instagram", success: false, error: "Meta not configured" });
    }

    // Twitter is handled by the /post skill via MCP tools — return adapted text
    if (targetPlatforms.includes("twitter")) {
      results.push({ platform: "twitter", success: true, postId: "pending-mcp", error: "Post via MCP tool" });
    }

    return c.json({ adaptedContent, results });
  });

  // ---- Content Engine (Build Logs + Weekly Digest) ----

  app.post("/api/content/buildlog", async (c) => {
    const body = await c.req.json<{ days?: number; topic?: string }>().catch(() => ({ days: 7, topic: "" }));
    const days = body.days || 7;
    const topic = body.topic || "";

    // Gather recent commits — local git log first (catches unpushed), then GitHub API
    let commits: Array<{ message: string; date: string; repo: string }> = [];
    try {
      const { execSync } = await import("child_process");
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
      const log = execSync(
        `git log --since="${since}" --pretty=format:"%s|||%aI" --no-merges -30`,
        { cwd: config.BODHI_PROJECT_DIR || process.cwd(), encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (log) {
        commits = log.split("\n").map((line) => {
          const [message, date] = line.split("|||");
          return { message, date, repo: "bodhi (local)" };
        });
      }
    } catch { /* local git optional */ }

    // Supplement with GitHub API if local git found nothing
    if (commits.length === 0 && githubService) {
      try {
        const allCommits = await githubService.getRecentCommits(30);
        const cutoff = Date.now() - days * 86400000;
        commits = allCommits
          .filter((c) => new Date(c.date).getTime() > cutoff)
          .map((c) => ({ message: c.message, date: c.date, repo: c.repo }));
      } catch { /* GitHub optional */ }
    }

    // Gather recent session memories
    let memories: Array<{ content: string; type: string }> = [];
    try {
      const searchQuery = `session progress ${topic} recent work`.trim();
      const retrieved = await memoryService.retrieve(searchQuery, 10);
      memories = retrieved.map((m) => ({ content: m.content, type: m.type }));
    } catch { /* memories optional */ }

    // Generate build log via Bridge
    const prompt = `You are a content writer for "build in public" posts on X/Twitter.

Given the following raw data about what was built recently, create an engaging post.

COMMITS (last ${days} days):
${commits.length > 0 ? commits.map((c) => `- ${c.message} (${c.repo})`).join("\n") : "No commits available"}

SESSION MEMORIES:
${memories.length > 0 ? memories.map((m) => `- [${m.type}] ${m.content}`).join("\n") : "No session memories available"}

${topic ? `FOCUS TOPIC: ${topic}` : ""}

Rules:
- Write in first person as a solo builder
- Format: What I built -> Why it matters -> What I learned
- If enough content for a thread, return 2-4 tweets. Otherwise return 1 tweet.
- Each tweet must be under 280 characters
- Be authentic, technical but accessible. No hashtags unless natural.
- Do NOT use emojis

Return ONLY valid JSON (no markdown, no code fences):
{"tweets": ["tweet1", "tweet2"], "summary": "one-line summary of what was built"}`;

    try {
      const response = await agent.chat(prompt);
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return c.json({
          buildlog: { tweets: parsed.tweets || [], summary: parsed.summary || "" },
          rawData: { commits: commits.length, memories: memories.length },
        });
      }
      return c.json({
        buildlog: { tweets: [response.content.slice(0, 280)], summary: "Raw response" },
        rawData: { commits: commits.length, memories: memories.length },
      });
    } catch (err) {
      console.error("[content] Buildlog generation failed:", err instanceof Error ? err.message : err);
      return c.json({ error: "Failed to generate build log" }, 500);
    }
  });

  app.post("/api/content/weekly-digest", async (c) => {
    // Gather 7-day data — local git first, then GitHub API
    let commits: Array<{ message: string; date: string; repo: string }> = [];
    try {
      const { execSync } = await import("child_process");
      const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const log = execSync(
        `git log --since="${since}" --pretty=format:"%s|||%aI" --no-merges -50`,
        { cwd: config.BODHI_PROJECT_DIR || process.cwd(), encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (log) {
        commits = log.split("\n").map((line) => {
          const [message, date] = line.split("|||");
          return { message, date, repo: "bodhi (local)" };
        });
      }
    } catch { /* local git optional */ }

    if (commits.length === 0 && githubService) {
      try {
        const allCommits = await githubService.getRecentCommits(50);
        const cutoff = Date.now() - 7 * 86400000;
        commits = allCommits
          .filter((c) => new Date(c.date).getTime() > cutoff)
          .map((c) => ({ message: c.message, date: c.date, repo: c.repo }));
      } catch { /* optional */ }
    }

    let memories: Array<{ content: string; type: string }> = [];
    try {
      const retrieved = await memoryService.retrieve("session summary weekly progress", 15);
      memories = retrieved.map((m) => ({ content: m.content, type: m.type }));
    } catch { /* optional */ }

    const prompt = `Summarize this week's work for a developer's weekly digest.

COMMITS THIS WEEK (${commits.length}):
${commits.slice(0, 20).map((c) => `- ${c.message}`).join("\n") || "None"}

SESSION MEMORIES:
${memories.map((m) => `- [${m.type}] ${m.content}`).join("\n") || "None"}

Create:
1. A weekly digest paragraph (3-5 sentences, conversational)
2. A tweet-sized summary (under 280 chars)

Return ONLY valid JSON:
{"digest": "...", "stats": {"commits": ${commits.length}, "memories": ${memories.length}}, "tweets": ["tweet-sized summary"]}`;

    try {
      const response = await agent.chat(prompt);
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return c.json(JSON.parse(jsonMatch[0]));
      }
      return c.json({ digest: response.content, stats: { commits: commits.length, memories: memories.length }, tweets: [] });
    } catch (err) {
      console.error("[content] Weekly digest failed:", err instanceof Error ? err.message : err);
      return c.json({ error: "Failed to generate weekly digest" }, 500);
    }
  });

  // ---- Content Pipeline Endpoints ----

  app.get("/api/content/queue", async (c) => {
    const status = c.req.query("status");
    let query = db.select().from(contentQueue).orderBy(sql`${contentQueue.lessonNumber} DESC`);
    if (status) {
      query = query.where(sql`${contentQueue.status} = ${status}`) as any;
    }
    const items = await query.limit(50);
    return c.json({ items });
  });

  app.get("/api/content/queue/:id", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(contentQueue).where(sql`${contentQueue.id} = ${id}`);
    if (rows.length === 0) return c.json({ error: "Not found" }, 404);
    return c.json(rows[0]);
  });

  app.post("/api/content/queue/:id/approve", async (c) => {
    const id = c.req.param("id");
    await db.update(contentQueue)
      .set({ status: "approved" as any, updatedAt: new Date() })
      .where(sql`${contentQueue.id} = ${id}`);
    return c.json({ approved: true });
  });

  app.post("/api/content/queue/:id/reject", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as { note?: string };
    await db.update(contentQueue)
      .set({ status: "rejected" as any, feedbackNote: body.note || null, updatedAt: new Date() })
      .where(sql`${contentQueue.id} = ${id}`);
    return c.json({ rejected: true });
  });

  app.post("/api/content/queue/:id/post", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(contentQueue).where(sql`${contentQueue.id} = ${id}`);
    if (rows.length === 0) return c.json({ error: "Not found" }, 404);

    const item = rows[0];
    if (item.status !== "approved") {
      return c.json({ error: "Item must be approved before posting" }, 400);
    }

    // Extract image URLs from slides
    const slides = item.slides as Array<{ imageUrl?: string }>;
    const imageUrls = slides.map((s) => s.imageUrl).filter(Boolean) as string[];

    if (!metaService || imageUrls.length === 0) {
      return c.json({ error: "Meta not configured or no images" }, 400);
    }

    const fbResult = await metaService.postCarouselToPage(item.caption, imageUrls);

    await db.update(contentQueue)
      .set({
        status: "posted" as any,
        postedAt: new Date(),
        postResults: { facebook: fbResult.postId } as any,
        updatedAt: new Date(),
      })
      .where(sql`${contentQueue.id} = ${id}`);

    return c.json({ posted: true, facebook: fbResult });
  });

  app.post("/api/content/generate", async (c) => {
    const result = await scheduler.trigger("content-generate");
    return c.json(result);
  });

  // Serve generated carousel images
  app.get("/content/images/:filename", async (c) => {
    const filename = c.req.param("filename");
    const filePath = path.resolve(process.cwd(), "data/content", filename);
    if (!fs.existsSync(filePath)) return c.json({ error: "Not found" }, 404);
    const buffer = fs.readFileSync(filePath);
    return new Response(buffer, { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" } });
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

  // API: Webhooks — real-time event ingestion
  app.post("/api/webhooks/github", async (c) => {
    const event = c.req.header("x-github-event") || "unknown";
    const body = await c.req.json();

    let content = "";
    let importance = 0.5;
    let notify = false;

    switch (event) {
      case "push": {
        const branch = body.ref?.replace("refs/heads/", "") || "unknown";
        const commits = body.commits?.length || 0;
        const pusher = body.pusher?.name || "unknown";
        content = `GitHub push: ${pusher} pushed ${commits} commit(s) to ${body.repository?.name}/${branch}`;
        break;
      }
      case "pull_request": {
        const pr = body.pull_request;
        const action = body.action;
        content = `GitHub PR ${action}: "${pr?.title}" (#${pr?.number}) in ${body.repository?.name} by ${pr?.user?.login}`;
        importance = action === "opened" || action === "closed" ? 0.7 : 0.5;
        notify = action === "opened" || (action === "closed" && pr?.merged);
        break;
      }
      case "issues": {
        const issue = body.issue;
        content = `GitHub issue ${body.action}: "${issue?.title}" (#${issue?.number}) in ${body.repository?.name}`;
        notify = body.action === "opened";
        break;
      }
      case "workflow_run": {
        const run = body.workflow_run;
        if (run?.conclusion === "failure") {
          content = `GitHub CI failed: "${run.name}" on ${body.repository?.name}/${run.head_branch}`;
          importance = 0.8;
          notify = true;
        } else if (run?.conclusion === "success") {
          content = `GitHub CI passed: "${run.name}" on ${body.repository?.name}/${run.head_branch}`;
        } else {
          content = `GitHub workflow ${body.action}: "${run?.name}" on ${body.repository?.name}`;
        }
        break;
      }
      default:
        content = `GitHub event: ${event} on ${body.repository?.name || "unknown repo"}`;
    }

    if (content) {
      try {
        await memoryService.store({
          content,
          type: "event",
          source: "extraction",
          importance,
          tags: ["github", "webhook", event],
        });
      } catch { /* non-critical */ }

      if (notify && telegramBot) {
        telegramBot?.sendProactiveMessage(`🔔 ${content}`).catch(() => {});
      }
    }

    return c.json({ ok: true, event });
  });

  app.post("/api/webhooks/vercel", async (c) => {
    const body = await c.req.json();
    const type = body.type || "unknown";

    let content = "";
    let notify = false;

    if (type === "deployment.created") {
      const d = body.payload?.deployment;
      content = `Vercel deploy started: ${d?.name} (${d?.meta?.githubCommitMessage || "no commit msg"})`;
    } else if (type === "deployment.succeeded") {
      const d = body.payload?.deployment;
      content = `Vercel deploy succeeded: ${d?.name} → ${d?.url}`;
    } else if (type === "deployment.error") {
      const d = body.payload?.deployment;
      content = `Vercel deploy FAILED: ${d?.name}`;
      notify = true;
    } else {
      content = `Vercel event: ${type}`;
    }

    if (content) {
      try {
        await memoryService.store({
          content,
          type: "event",
          source: "extraction",
          importance: notify ? 0.8 : 0.5,
          tags: ["vercel", "webhook", type],
        });
      } catch { /* non-critical */ }

      if (notify && telegramBot) {
        telegramBot?.sendProactiveMessage(`🔔 ${content}`).catch(() => {});
      }
    }

    return c.json({ ok: true, type });
  });

  app.post("/api/webhooks/supabase", async (c) => {
    const body = await c.req.json();
    const type = body.type || "unknown";

    const content = `Supabase event: ${type} — ${JSON.stringify(body.record || body.payload || {}).slice(0, 200)}`;
    try {
      await memoryService.store({
        content,
        type: "event",
        source: "extraction",
        importance: 0.5,
        tags: ["supabase", "webhook", type],
      });
    } catch { /* non-critical */ }

    return c.json({ ok: true, type });
  });

  // API: Status
  app.get("/api/status", (c) => {
    return c.json({
      agent: "online",
      bridge: config.ANTHROPIC_API_KEY ? "api" : ("isRunning" in backend ? ((backend as Bridge).isRunning ? "running" : "idle") : "idle"),
      memory: "active",
      notion: notionService ? "connected" : "not configured",
      github: githubService ? "connected" : "not configured",
      vercel: vercelService ? "connected" : "not configured",
      supabase: supabaseAwarenessService ? "connected" : "not configured",
      meta: metaService ? "connected" : "not configured",
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
  if (telegramBot) {
    telegramBot.start().catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  Telegram: FAILED to start — ${msg}`);
      console.error("  (Server continues without Telegram)");
    });
  }

  console.log("\n🌳  BODHI is online.\n");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🌳  BODHI shutting down...");
    scheduler.stop();
    try {
      await telegramBot?.stop();
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
