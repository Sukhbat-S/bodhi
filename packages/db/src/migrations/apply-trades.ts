// ============================================================
// BODHI — One-shot migration for the trades table
// Run via: npx tsx packages/db/src/migrations/apply-trades.ts
//
// Idempotent: safe to run multiple times. Only creates the enum
// types and table if they don't already exist.
// ============================================================

import "dotenv/config";
import { getDb } from "../client.js";
import { sql } from "drizzle-orm";

const TRADE_STATUS_DDL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_status') THEN
    CREATE TYPE trade_status AS ENUM ('open', 'closed', 'cancelled');
  END IF;
END $$;
`;

const TRADE_SIDE_DDL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_side') THEN
    CREATE TYPE trade_side AS ENUM ('long', 'short');
  END IF;
END $$;
`;

const TRADES_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  side trade_side NOT NULL,
  status trade_status NOT NULL DEFAULT 'open',
  entry_price real NOT NULL,
  exit_price real,
  stop_loss real NOT NULL,
  take_profit real,
  size real NOT NULL,
  thesis text NOT NULL,
  catalyst text,
  mossetch_review text,
  confidence integer NOT NULL DEFAULT 3,
  pnl_usd real,
  r_multiple real,
  postmortem text,
  is_paper boolean NOT NULL DEFAULT true,
  exchange_order_id text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
`;

const TRADES_IDX_DDL = `
CREATE INDEX IF NOT EXISTS trades_status_idx ON trades (status);
CREATE INDEX IF NOT EXISTS trades_opened_at_idx ON trades (opened_at DESC);
CREATE INDEX IF NOT EXISTS trades_symbol_idx ON trades (symbol);
`;

async function main() {
  const db = getDb();
  console.log("[trades-migration] Connecting to DB...");
  await db.execute(sql.raw(TRADE_STATUS_DDL));
  console.log("[trades-migration] trade_status enum ensured");
  await db.execute(sql.raw(TRADE_SIDE_DDL));
  console.log("[trades-migration] trade_side enum ensured");
  await db.execute(sql.raw(TRADES_TABLE_DDL));
  console.log("[trades-migration] trades table ensured");
  await db.execute(sql.raw(TRADES_IDX_DDL));
  console.log("[trades-migration] indexes ensured");
  console.log("[trades-migration] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[trades-migration] FAILED:", err);
  process.exit(1);
});
