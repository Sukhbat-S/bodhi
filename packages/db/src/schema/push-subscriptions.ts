// ============================================================
// BODHI — Push Subscription Schema
// Stores Web Push API subscriptions for PWA notifications
// ============================================================

import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys")
    .$type<{ p256dh: string; auth: string }>()
    .notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});
