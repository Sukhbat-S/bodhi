// ============================================================
// BODHI — Workflow Runs Schema (Drizzle ORM)
// Tracks multi-step workflow execution state
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

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: text("workflow_id").notNull(),
  status: workflowRunStatusEnum("status").notNull().default("running"),
  currentStep: integer("current_step").notNull().default(0),
  stepsTotal: integer("steps_total").notNull(),
  stepOutputs: jsonb("step_outputs").$type<StepOutputJSON[]>().default([]),
  pauseReason: text("pause_reason"),
  trigger: text("trigger"), // "cron" | "manual" | "telegram"
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

interface StepOutputJSON {
  stepName: string;
  output: string;
  durationMs: number;
  skipped: boolean;
}
