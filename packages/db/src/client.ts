// ============================================================
// SENECA — Database Client (Drizzle + PostgreSQL)
// ============================================================

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let db: ReturnType<typeof createDb> | null = null;

function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return drizzle(client, { schema });
}

export function getDb(connectionString?: string) {
  if (db) return db;

  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env or pass it directly."
    );
  }

  db = createDb(url);
  return db;
}

export type Database = ReturnType<typeof getDb>;
