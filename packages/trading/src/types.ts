// ============================================================
// BODHI — Trading Types
// ============================================================

export type TradeSide = "long" | "short";
export type TradeStatus = "open" | "closed" | "cancelled";
export type TradeCatalyst =
  | "cpi-soft"
  | "cpi-hot"
  | "clarity-act"
  | "fomc"
  | "technical"
  | "manual"
  | "other";

export interface OpenTradeInput {
  symbol: string;              // e.g. "BTC/USDT"
  side: TradeSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  size: number;                // USD notional
  thesis: string;              // max 500 chars, why
  catalyst?: TradeCatalyst;
  confidence: 1 | 2 | 3 | 4 | 5;
  mossetchReview?: string;     // pre-entry critique
  isPaper: boolean;            // paper vs real money
  exchangeOrderId?: string;    // Bybit order ID if live
}

export interface CloseTradeInput {
  id: string;
  exitPrice: number;
  postmortem: string;          // what worked / didn't
}

export interface Trade extends OpenTradeInput {
  id: string;
  status: TradeStatus;
  exitPrice?: number;
  pnlUsd?: number;
  rMultiple?: number;
  postmortem?: string;
  openedAt: Date;
  closedAt?: Date;
}

export interface ExchangeBalance {
  total: Record<string, number>;
  free: Record<string, number>;
  used: Record<string, number>;
  totalUsd: number;
}

export interface ExchangePosition {
  symbol: string;
  side: TradeSide;
  contracts: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface TradingConfig {
  apiKey: string;
  apiSecret: string;
  /** If true, use Bybit testnet. Default true for safety. */
  useTestnet?: boolean;
  /** Hard cap in USD — no single trade can risk more than this */
  maxRiskPerTradeUsd?: number;
  /** Hard cap on total position size */
  maxPositionSizeUsd?: number;
}
