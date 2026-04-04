// ============================================================
// BODHI — Entity Graph Schema (Drizzle ORM)
// People, projects, topics linked to memories
// ============================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  integer,
  unique,
} from "drizzle-orm/pg-core";

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(), // person | project | topic | organization | place
  aliases: jsonb("aliases").$type<string[]>(),
  description: text("description"),
  importance: real("importance").notNull().default(0.5),
  mentionCount: integer("mention_count").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Junction table: links entities to memories
// Note: memoryId FK to memories.id added via SQL (avoids drizzle-kit cross-file import issue)
export const entityMemories = pgTable(
  "entity_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id").notNull(),
    role: text("role"), // subject | mentioned | related
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.entityId, t.memoryId)]
);
