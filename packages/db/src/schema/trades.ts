// ============================================================
// BODHI — Trading Journal Schema
// Every trade entered + exited is persisted here.
// Real and paper trades share the same table, distinguished by isPaper.
// ============================================================

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  real,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const tradeSideEnum = pgEnum("trade_side", ["long", "short"]);

export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull(),                              // "BTC/USDT"
  side: tradeSideEnum("side").notNull(),
  status: tradeStatusEnum("status").notNull().default("open"),

  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  stopLoss: real("stop_loss").notNull(),
  takeProfit: real("take_profit"),
  size: real("size").notNull(),                                  // USD notional

  thesis: text("thesis").notNull(),                              // why the entry
  catalyst: text("catalyst"),                                    // "cpi-soft" | "clarity" | etc
  mossetchReview: text("mossetch_review"),                       // pre-entry critique
  confidence: integer("confidence").notNull().default(3),        // 1-5

  pnlUsd: real("pnl_usd"),                                       // realized P&L
  rMultiple: real("r_multiple"),                                 // realized R multiple
  postmortem: text("postmortem"),                                // post-close reflection

  isPaper: boolean("is_paper").notNull().default(true),          // paper vs real money
  exchangeOrderId: text("exchange_order_id"),                    // Bybit order ID

  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});
