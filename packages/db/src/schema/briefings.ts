// ============================================================
// BODHI — Briefings Schema
// Persists generated briefings for the PWA feed
// ============================================================

import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const briefingTypeEnum = pgEnum("briefing_type", [
  "morning",
  "evening",
  "weekly",
  "daily-intel",
  "jewelry-changelog",
]);

export const briefings = pgTable("briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: briefingTypeEnum("type").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
