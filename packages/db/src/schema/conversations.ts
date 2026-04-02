// ============================================================
// BODHI — Conversation Schema (Drizzle ORM)
// ============================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";

export const channelEnum = pgEnum("channel", ["telegram", "web", "cli"]);
export const roleEnum = pgEnum("message_role", ["user", "assistant"]);

// --- Conversation Threads ---

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "success",
  "failed",
  "abandoned",
]);

export const conversationThreads = pgTable("conversation_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: channelEnum("channel").notNull(),
  channelThreadId: text("channel_thread_id"),
  title: text("title"),
  summary: text("summary"),
  extractionStatus: extractionStatusEnum("extraction_status"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  extractionAttempts: integer("extraction_attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Conversation Turns ---

export const conversationTurns = pgTable("conversation_turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => conversationThreads.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  content: text("content").notNull(),
  channel: channelEnum("channel").notNull(),
  toolCalls: jsonb("tool_calls").$type<ToolCallJSON[]>(),
  contextSnapshot: jsonb("context_snapshot"),
  tokenUsage: jsonb("token_usage").$type<TokenUsageJSON>(),
  modelUsed: text("model_used"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Bridge Tasks ---

export const bridgeTaskStatusEnum = pgEnum("bridge_task_status", [
  "idle",
  "running",
  "completed",
  "error",
]);

export const bridgeTasks = pgTable("bridge_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").references(() => conversationThreads.id),
  prompt: text("prompt").notNull(),
  cwd: text("cwd").notNull(),
  allowedTools: jsonb("allowed_tools").$type<string[]>().notNull(),
  maxTurns: integer("max_turns").notNull().default(10),
  maxBudgetUsd: integer("max_budget_usd"),
  status: bridgeTaskStatusEnum("status").notNull().default("idle"),
  progress: jsonb("progress").$type<string[]>().default([]),
  result: text("result"),
  error: text("error"),
  sessionId: text("session_id"),
  tokenUsage: jsonb("token_usage").$type<TokenUsageJSON>(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// --- JSON Types ---

interface ToolCallJSON {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: string;
  durationMs: number;
  status: "success" | "error";
}

interface TokenUsageJSON {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
