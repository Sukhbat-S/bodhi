// ============================================================
// BODHI — Memory Schema (Drizzle ORM + pgvector)
// ============================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  real,
  integer,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const memoryTypeEnum = pgEnum("memory_type", [
  "fact",
  "decision",
  "pattern",
  "preference",
  "event",
  "goal",
]);

export const memorySourceEnum = pgEnum("memory_source", [
  "conversation",
  "manual",
  "extraction",
  "synthesis",
]);

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: memoryTypeEnum("type").notNull().default("fact"),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  source: memorySourceEnum("source").notNull().default("extraction"),
  sourceThreadId: uuid("source_thread_id"),
  importance: real("importance").notNull().default(0.5),
  confidence: real("confidence").notNull().default(1.0),
  tags: jsonb("tags").$type<string[]>(),
  accessCount: integer("access_count").notNull().default(0),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
