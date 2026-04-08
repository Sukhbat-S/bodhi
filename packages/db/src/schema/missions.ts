// ============================================================
// BODHI — Mission Persistence
// Stores orchestrator missions and their tasks in PostgreSQL
// ============================================================

import { pgTable, pgEnum, text, timestamp, uuid, jsonb, real, integer } from "drizzle-orm/pg-core";

export const missionStatusEnum = pgEnum("mission_status", [
  "planning", "executing", "completed", "failed", "cancelled",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending", "running", "completed", "failed", "repaired",
]);

export const missions = pgTable("missions", {
  id: uuid("id").defaultRandom().primaryKey(),
  goal: text("goal").notNull(),
  model: text("model").notNull().default("opus"),
  status: missionStatusEnum("status").notNull().default("planning"),
  plan: jsonb("plan"),
  result: text("result"),
  error: text("error"),
  confidence: real("confidence"),
  predictionErrors: jsonb("prediction_errors"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const missionTasks = pgTable("mission_tasks", {
  id: text("id").primaryKey(),
  missionId: uuid("mission_id").notNull().references(() => missions.id),
  title: text("title").notNull(),
  prompt: text("prompt"),
  status: taskStatusEnum("status").notNull().default("pending"),
  result: text("result"),
  error: text("error"),
  confidence: real("confidence"),
  predictionErrors: jsonb("prediction_errors"),
  repairAttempts: integer("repair_attempts").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
