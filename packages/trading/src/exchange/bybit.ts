// ============================================================
// BODHI — Bybit Exchange Client
// Thin ccxt wrapper. Testnet by default. Never touches mainnet
// unless explicitly opted in via useTestnet: false.
// ============================================================

import ccxt, { type bybit as BybitExchange } from "ccxt";
import type {
  ExchangeBalance,
  ExchangePosition,
  TradingConfig,
  TradeSide,
} from "../types.js";

export class BybitClient {
  private exchange: BybitExchange;
  private useTestnet: boolean;

  constructor(config: TradingConfig) {
    this.useTestnet = config.useTestnet !== false; // default true

    this.exchange = new ccxt.bybit({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: "spot",
      },
    });

    if (this.useTestnet) {
      this.exchange.setSandboxMode(true);
    }
  }

  get isTestnet(): boolean {
    return this.useTestnet;
  }

  /**
   * Fetch account balance. Returns free/used/total per currency plus
   * a naive USD total across stablecoins + BTC/ETH at current price.
   */
  async getBalance(): Promise<ExchangeBalance> {
    const raw = await this.exchange.fetchBalance();
    const total: Record<string, number> = {};
    const free: Record<string, number> = {};
    const used: Record<string, number> = {};

    for (const [currency, amounts] of Object.entries(raw.total || {})) {
      const n = Number(amounts);
      if (n > 0) total[currency] = n;
    }
    for (const [currency, amounts] of Object.entries(raw.free || {})) {
      const n = Number(amounts);
      if (n > 0) free[currency] = n;
    }
    for (const [currency, amounts] of Object.entries(raw.used || {})) {
      const n = Number(amounts);
      if (n > 0) used[currency] = n;
    }

    // Naive USD value: stablecoins 1:1, BTC/ETH at spot
    let totalUsd = 0;
    for (const [currency, amount] of Object.entries(total)) {
      if (currency === "USDT" || currency === "USDC" || currency === "DAI" || currency === "USD") {
        totalUsd += amount;
      } else if (currency === "BTC" || currency === "ETH" || currency === "SOL") {
        try {
          const ticker = await this.exchange.fetchTicker(`${currency}/USDT`);
          totalUsd += amount * Number(ticker.last || 0);
        } catch {
          // ignore pricing errors for exotic coins
        }
      }
    }

    return { total, free, used, totalUsd };
  }

  /**
   * Fetch the current price of a symbol (e.g. "BTC/USDT").
   */
  async getTicker(symbol: string): Promise<{ last: number; bid: number; ask: number }> {
    const t = await this.exchange.fetchTicker(symbol);
    return {
      last: Number(t.last || 0),
      bid: Number(t.bid || 0),
      ask: Number(t.ask || 0),
    };
  }

  /**
   * Fetch open positions (futures/margin). Returns empty array for spot-only accounts.
   */
  async getPositions(): Promise<ExchangePosition[]> {
    try {
      const raw = (await this.exchange.fetchPositions()) as unknown as Array<Record<string, unknown>>;
      return raw
        .filter((p) => Number(p.contracts || 0) > 0)
        .map((p) => ({
          symbol: String(p.symbol || ""),
          side: ((p.side as string) === "short" ? "short" : "long") as TradeSide,
          contracts: Number(p.contracts || 0),
          entryPrice: Number(p.entryPrice || 0),
          markPrice: Number(p.markPrice || 0),
          unrealizedPnl: Number(p.unrealizedPnl || 0),
          leverage: Number(p.leverage || 1),
        }));
    } catch {
      // Spot-only accounts don't have positions
      return [];
    }
  }

  /**
   * Fetch OHLCV candles for backtesting.
   * timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
   */
  async getCandles(
    symbol: string,
    timeframe = "1h",
    limit = 200,
    since?: number,
  ): Promise<Array<[number, number, number, number, number, number]>> {
    const raw = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
    return raw as Array<[number, number, number, number, number, number]>;
  }
}
