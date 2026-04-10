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

  /**
   * Pre-trade intelligence: query past trades that match similar conditions
   * and compute a setup-specific Kelly fraction for position sizing.
   *
   * This is the meta-layer — it turns BODHI's trade memory into an
   * adaptive sizing engine that gets smarter with every closed trade.
   */
  async preTradeQuery(conditions: {
    catalyst?: string;
    side?: "long" | "short";
    symbol?: string;
  }): Promise<{
    matchingTrades: number;
    winRate: number;
    avgR: number;
    avgPnlUsd: number;
    kellyFraction: number;
    suggestedSizeUsd: number;
    confidence: "no-data" | "low" | "medium" | "high";
    reasoning: string;
    matches: Array<{ symbol: string; side: string; pnlUsd: number; rMultiple: number; thesis: string; catalyst: string | undefined }>;
  }> {
    // Fetch all closed trades
    const all = await this.db
      .select()
      .from(trades)
      .where(eq(trades.status, "closed"));

    // Filter by matching conditions
    let matches = all;
    if (conditions.catalyst) {
      matches = matches.filter((t) => t.catalyst === conditions.catalyst);
    }
    if (conditions.side) {
      matches = matches.filter((t) => t.side === conditions.side);
    }
    if (conditions.symbol) {
      matches = matches.filter((t) => t.symbol === conditions.symbol);
    }

    // If no condition-specific matches, fall back to ALL closed trades
    const useAll = matches.length < 3;
    const pool = useAll ? all : matches;

    if (pool.length === 0) {
      return {
        matchingTrades: 0,
        winRate: 0,
        avgR: 0,
        avgPnlUsd: 0,
        kellyFraction: 0,
        suggestedSizeUsd: 10, // default minimum DCA
        confidence: "no-data",
        reasoning: "No closed trades yet. Using default $10 DCA size. The meta-layer activates after 3+ closed trades.",
        matches: [],
      };
    }

    const winners = pool.filter((t) => (t.pnlUsd ?? 0) > 0);
    const losers = pool.filter((t) => (t.pnlUsd ?? 0) < 0);
    const winRate = pool.length > 0 ? winners.length / pool.length : 0;
    const avgWin = winners.length > 0
      ? winners.reduce((s, t) => s + (t.pnlUsd ?? 0), 0) / winners.length
      : 0;
    const avgLoss = losers.length > 0
      ? Math.abs(losers.reduce((s, t) => s + (t.pnlUsd ?? 0), 0) / losers.length)
      : 1; // prevent division by zero
    const avgR = pool.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / pool.length;
    const avgPnlUsd = pool.reduce((s, t) => s + (t.pnlUsd ?? 0), 0) / pool.length;

    // Kelly criterion: f* = (bp - q) / b
    // b = avg win / avg loss, p = win rate, q = 1 - p
    const b = avgLoss > 0 ? avgWin / avgLoss : 0;
    const p = winRate;
    const q = 1 - p;
    const fullKelly = b > 0 ? (b * p - q) / b : 0;

    // Confidence scaling: scale Kelly by data depth
    // < 5 trades = quarter Kelly, 5-10 = half, 10-20 = three-quarter, 20+ = half (never full)
    const datapoints = pool.length;
    let confidenceScale: number;
    let confidence: "no-data" | "low" | "medium" | "high";
    if (datapoints < 5) {
      confidenceScale = 0.25;
      confidence = "low";
    } else if (datapoints < 10) {
      confidenceScale = 0.5;
      confidence = "medium";
    } else if (datapoints < 20) {
      confidenceScale = 0.5;
      confidence = "medium";
    } else {
      confidenceScale = 0.5; // never use full Kelly — half Kelly max
      confidence = "high";
    }

    const kellyFraction = Math.max(0, Math.min(0.25, fullKelly * confidenceScale));

    // Apply to account: assume $100 base, Kelly fraction determines size
    // Floor at $5 (minimum viable trade), cap at $25 (risk rule)
    const rawSize = 100 * kellyFraction;
    const suggestedSizeUsd = Math.max(5, Math.min(25, rawSize));

    const reasoning = [
      useAll ? `Using ALL ${pool.length} closed trades (not enough condition-specific matches).` :
        `Found ${pool.length} trades matching conditions (catalyst=${conditions.catalyst || "any"}, side=${conditions.side || "any"}, symbol=${conditions.symbol || "any"}).`,
      `Win rate: ${(winRate * 100).toFixed(0)}% (${winners.length}W / ${losers.length}L).`,
      `Avg R: ${avgR.toFixed(2)}. Avg P&L: $${avgPnlUsd.toFixed(2)}.`,
      `Full Kelly: ${(fullKelly * 100).toFixed(1)}%. Confidence-scaled (${confidence}, ${(confidenceScale * 100).toFixed(0)}%): ${(kellyFraction * 100).toFixed(1)}%.`,
      `Suggested size: $${suggestedSizeUsd.toFixed(0)} (floor $5, cap $25).`,
    ].join(" ");

    return {
      matchingTrades: pool.length,
      winRate,
      avgR,
      avgPnlUsd,
      kellyFraction,
      suggestedSizeUsd,
      confidence,
      reasoning,
      matches: pool.slice(0, 5).map((t) => ({
        symbol: t.symbol,
        side: t.side,
        pnlUsd: t.pnlUsd ?? 0,
        rMultiple: t.rMultiple ?? 0,
        thesis: t.thesis,
        catalyst: t.catalyst ?? undefined,
      })),
    };
  }
}
