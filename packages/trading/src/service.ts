// ============================================================
// BODHI — Trading Service
// Journal + query layer over the `trades` table. All entries
// and exits flow through here so nothing is ever logged blind.
// ============================================================

import type { Database } from "@seneca/db";
import { trades } from "@seneca/db";
import { sql, desc, eq, and } from "drizzle-orm";
import type {
  OpenTradeInput,
  CloseTradeInput,
  Trade,
  TradeSide,
  TradeStatus,
} from "./types.js";

type TradeRow = typeof trades.$inferSelect;

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side as TradeSide,
    status: row.status as TradeStatus,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice ?? undefined,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit ?? undefined,
    size: row.size,
    thesis: row.thesis,
    catalyst: (row.catalyst as Trade["catalyst"]) ?? undefined,
    mossetchReview: row.mossetchReview ?? undefined,
    confidence: (row.confidence as 1 | 2 | 3 | 4 | 5) ?? 3,
    pnlUsd: row.pnlUsd ?? undefined,
    rMultiple: row.rMultiple ?? undefined,
    postmortem: row.postmortem ?? undefined,
    isPaper: row.isPaper,
    exchangeOrderId: row.exchangeOrderId ?? undefined,
    openedAt: row.openedAt,
    closedAt: row.closedAt ?? undefined,
  };
}

export class TradingService {
  constructor(private db: Database) {}

  /**
   * Log a new trade entry. Mossetch review is OPTIONAL at the type
   * level but strongly encouraged for real-money trades — the server
   * should enforce that constraint separately.
   */
  async openTrade(input: OpenTradeInput): Promise<Trade> {
    if (input.size <= 0) throw new Error("size must be > 0");
    if (input.stopLoss <= 0) throw new Error("stopLoss must be > 0");
    if (input.entryPrice <= 0) throw new Error("entryPrice must be > 0");
    if (input.thesis.trim().length < 10) {
      throw new Error("thesis must be at least 10 chars — write why you're entering");
    }
    // Risk guardrail: ensure the stop makes sense relative to entry
    if (input.side === "long" && input.stopLoss >= input.entryPrice) {
      throw new Error("long stop must be below entry price");
    }
    if (input.side === "short" && input.stopLoss <= input.entryPrice) {
      throw new Error("short stop must be above entry price");
    }

    const [row] = await this.db
      .insert(trades)
      .values({
        symbol: input.symbol,
        side: input.side,
        status: "open",
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        size: input.size,
        thesis: input.thesis,
        catalyst: input.catalyst,
        mossetchReview: input.mossetchReview,
        confidence: input.confidence,
        isPaper: input.isPaper,
        exchangeOrderId: input.exchangeOrderId,
      })
      .returning();

    return rowToTrade(row);
  }

  /**
   * Close a trade. Computes P&L and R-multiple from entry, exit, stop.
   * Requires a postmortem — no closing blind.
   */
  async closeTrade(input: CloseTradeInput): Promise<Trade> {
    if (input.postmortem.trim().length < 10) {
      throw new Error("postmortem must be at least 10 chars — what did you learn?");
    }

    const [existing] = await this.db
      .select()
      .from(trades)
      .where(eq(trades.id, input.id))
      .limit(1);
    if (!existing) throw new Error(`trade ${input.id} not found`);
    if (existing.status !== "open") throw new Error(`trade ${input.id} is ${existing.status}, not open`);

    const side = existing.side as TradeSide;
    const priceDelta = side === "long"
      ? input.exitPrice - existing.entryPrice
      : existing.entryPrice - input.exitPrice;

    // Units: size is USD notional, so qty = size / entryPrice
    const qty = existing.size / existing.entryPrice;
    const pnlUsd = priceDelta * qty;

    // R-multiple: (exit - entry) / (entry - stop), sign-adjusted
    const riskPerUnit = Math.abs(existing.entryPrice - existing.stopLoss);
    const rMultiple = riskPerUnit > 0 ? priceDelta / riskPerUnit : 0;

    const [row] = await this.db
      .update(trades)
      .set({
        status: "closed",
        exitPrice: input.exitPrice,
        pnlUsd,
        rMultiple,
        postmortem: input.postmortem,
        closedAt: new Date(),
      })
      .where(eq(trades.id, input.id))
      .returning();

    return rowToTrade(row);
  }

  /**
   * Cancel an open trade without a fill (e.g. mistaken entry).
   * P&L is not computed — stays null.
   */
  async cancelTrade(id: string, reason: string): Promise<Trade> {
    const [row] = await this.db
      .update(trades)
      .set({
        status: "cancelled",
        postmortem: `CANCELLED: ${reason}`,
        closedAt: new Date(),
      })
      .where(and(eq(trades.id, id), eq(trades.status, "open")))
      .returning();

    if (!row) throw new Error(`trade ${id} not found or not open`);
    return rowToTrade(row);
  }

  async getOpen(paperOnly = false): Promise<Trade[]> {
    const rows = await this.db
      .select()
      .from(trades)
      .where(
        paperOnly
          ? and(eq(trades.status, "open"), eq(trades.isPaper, true))
          : eq(trades.status, "open"),
      )
      .orderBy(desc(trades.openedAt));
    return rows.map(rowToTrade);
  }

  async getRecent(limit = 20, paperOnly = false): Promise<Trade[]> {
    const rows = await this.db
      .select()
      .from(trades)
      .where(paperOnly ? eq(trades.isPaper, true) : sql`true`)
      .orderBy(desc(trades.openedAt))
      .limit(limit);
    return rows.map(rowToTrade);
  }

  async getById(id: string): Promise<Trade | null> {
    const [row] = await this.db.select().from(trades).where(eq(trades.id, id)).limit(1);
    return row ? rowToTrade(row) : null;
  }

  /**
   * Aggregate stats across closed trades — win rate, avg R, total P&L,
   * biggest winner, biggest loser. Useful for dashboard + briefings.
   */
  async getStats(paperOnly = false): Promise<{
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winners: number;
    losers: number;
    breakeven: number;
    winRate: number;
    totalPnlUsd: number;
    avgRMultiple: number;
    biggestWin: number;
    biggestLoss: number;
  }> {
    const all = await this.db
      .select()
      .from(trades)
      .where(paperOnly ? eq(trades.isPaper, true) : sql`true`);

    const closed = all.filter((t) => t.status === "closed" && t.pnlUsd != null);
    const winners = closed.filter((t) => (t.pnlUsd ?? 0) > 0);
    const losers = closed.filter((t) => (t.pnlUsd ?? 0) < 0);
    const breakeven = closed.filter((t) => (t.pnlUsd ?? 0) === 0);

    const totalPnlUsd = closed.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);
    const totalR = closed.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0);

    return {
      totalTrades: all.length,
      openTrades: all.filter((t) => t.status === "open").length,
      closedTrades: closed.length,
      winners: winners.length,
      losers: losers.length,
      breakeven: breakeven.length,
      winRate: closed.length > 0 ? winners.length / closed.length : 0,
      totalPnlUsd,
      avgRMultiple: closed.length > 0 ? totalR / closed.length : 0,
      biggestWin: closed.reduce((max, t) => Math.max(max, t.pnlUsd ?? 0), 0),
      biggestLoss: closed.reduce((min, t) => Math.min(min, t.pnlUsd ?? 0), 0),
    };
  }
}
