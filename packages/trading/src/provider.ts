// ============================================================
// BODHI — Trading Context Provider
// Injects open positions, recent trades, and account balance
// into agent prompts when the message is trading-related.
// Priority 9 — between projects (9) and entities (8).
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { TradingService } from "./service.js";
import type { BybitClient } from "./exchange/bybit.js";

const TRADING_KEYWORDS = [
  "trade", "trades", "trading", "position", "positions",
  "pnl", "p&l", "profit", "loss",
  "bybit", "binance", "crypto", "btc", "eth", "sol",
  "long", "short", "entry", "exit", "stop", "stoploss", "take profit",
  "balance", "equity", "portfolio", "strategy",
  "catalyst", "fomc", "cpi", "clarity",
  "backtest", "paper trade",
  "briefing", "morning", "evening", // briefings should include trading status
];

interface TradingProviderConfig {
  service: TradingService;
  client?: BybitClient; // optional — may not be wired if keys absent
}

export class TradingContextProvider implements ContextProvider {
  name = "trading";
  priority = 9;

  private service: TradingService;
  private client?: BybitClient;

  constructor(config: TradingProviderConfig) {
    this.service = config.service;
    this.client = config.client;
  }

  async gather(message?: string): Promise<ContextFragment> {
    const rel = message ? this.relevance(message) : 0.5;
    if (rel < 0.3) {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }

    try {
      // Fetch in parallel so the hot path doesn't block
      const [open, stats, balance] = await Promise.all([
        this.service.getOpen(),
        this.service.getStats(),
        this.client ? this.client.getBalance().catch(() => null) : Promise.resolve(null),
      ]);

      const lines: string[] = ["Trading status:"];

      if (balance && balance.totalUsd > 0) {
        const mode = this.client?.isTestnet ? "testnet" : "LIVE";
        lines.push(`- Account (${mode}): $${balance.totalUsd.toFixed(2)} USD`);
      }

      if (stats.closedTrades > 0) {
        const pnlSign = stats.totalPnlUsd >= 0 ? "+" : "";
        lines.push(
          `- Closed trades: ${stats.closedTrades} | Win rate: ${(stats.winRate * 100).toFixed(0)}% | ` +
          `P&L: ${pnlSign}$${stats.totalPnlUsd.toFixed(2)} | Avg R: ${stats.avgRMultiple.toFixed(2)}`
        );
      } else {
        lines.push("- No closed trades yet (paper trading phase)");
      }

      if (open.length === 0) {
        lines.push("- No open positions");
      } else {
        lines.push(`- Open positions (${open.length}):`);
        for (const t of open.slice(0, 5)) {
          const ageHours = Math.round((Date.now() - t.openedAt.getTime()) / (1000 * 60 * 60));
          lines.push(
            `  * ${t.side.toUpperCase()} ${t.symbol} @ ${t.entryPrice} | ` +
            `stop ${t.stopLoss} | size $${t.size} | ${ageHours}h old | ` +
            `thesis: ${t.thesis.slice(0, 80)}`
          );
        }
      }

      const content = lines.join("\n");
      return {
        provider: this.name,
        content,
        tokenEstimate: Math.ceil(content.length / 4),
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[trading-context] Failed to gather:",
        error instanceof Error ? error.message : error,
      );
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();

    // Strong signal: explicit trading terms
    if (lower.includes("trade") || lower.includes("position") || lower.includes("bybit")) {
      return 0.95;
    }
    if (lower.includes("crypto") || lower.includes("btc") || lower.includes("eth")) {
      return 0.85;
    }
    // Briefings should always include trading status (it's part of the daily picture)
    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening")) {
      return 0.7;
    }

    const matches = TRADING_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.75;
    if (matches.length === 1) return 0.45;
    return 0.1;
  }
}
