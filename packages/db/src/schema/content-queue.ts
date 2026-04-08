// ============================================================
// BODHI — Content Queue Schema
// Tracks carousel content through the generation pipeline:
// draft → ready → approved → posted (or rejected)
// ============================================================

import { pgTable, uuid, text, timestamp, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "ready",
  "approved",
  "posted",
  "rejected",
]);

export interface CarouselSlide {
  title: string;
  body: string;
  code?: string;
  imageUrl?: string; // set after rendering
}

export const contentQueue = pgTable("content_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonNumber: integer("lesson_number").notNull(),
  topic: text("topic").notNull(),
  slides: jsonb("slides").$type<CarouselSlide[]>().notNull(),
  caption: text("caption").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  feedbackNote: text("feedback_note"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  postResults: jsonb("post_results").$type<{ facebook?: string; instagram?: string }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
