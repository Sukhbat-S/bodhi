// ============================================================
// BODHI — Active Sessions + Inter-Session Messaging
// Tracks live Claude Code sessions and enables communication
// ============================================================

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const activeSessions = pgTable("active_sessions", {
  id: text("id").primaryKey(),
  project: text("project").notNull(),
  description: text("description").notNull().default(""),
  currentFile: text("current_file"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastPingAt: timestamp("last_ping_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionMessages = pgTable("session_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  fromSession: text("from_session").notNull(),
  toSession: text("to_session"),  // null = broadcast to all
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
