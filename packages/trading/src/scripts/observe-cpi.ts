#!/usr/bin/env npx tsx
// ============================================================
// BODHI — CPI Observation Script
// Fetches BTC & ETH spot prices from Bybit public API (no auth).
// Run: npx tsx packages/trading/src/scripts/observe-cpi.ts
// ============================================================

import ccxt from "ccxt";

async function main() {
  const exchange = new ccxt.bybit({ enableRateLimit: true });

  const [btc, eth] = await Promise.all([
    exchange.fetchTicker("BTC/USDT"),
    exchange.fetchTicker("ETH/USDT"),
  ]);

  const now = new Date();
  const utc = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  // UB = UTC+8
  const ub = new Date(now.getTime() + 8 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19) + " UB";

  const btcPrice = Number(btc.last || 0);
  const ethPrice = Number(eth.last || 0);
  const btcChange = Number(btc.percentage || 0);
  const ethChange = Number(eth.percentage || 0);

  const line = (label: string, price: number, change: number) => {
    const sign = change >= 0 ? "+" : "";
    return `  ${label.padEnd(10)} $${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}  (${sign}${change.toFixed(2)}% 24h)`;
  };

  console.log("");
  console.log("=== CPI Observation ===");
  console.log(`  Time:      ${utc}`);
  console.log(`             ${ub}`);
  console.log("");
  console.log(line("BTC/USDT", btcPrice, btcChange));
  console.log(line("ETH/USDT", ethPrice, ethChange));
  console.log("");
  console.log("--- For BODHI memory / social ---");
  console.log(
    `CPI observation ${now.toISOString().slice(0, 10)}: ` +
    `BTC $${btcPrice.toLocaleString()} (${btcChange >= 0 ? "+" : ""}${btcChange.toFixed(1)}%), ` +
    `ETH $${ethPrice.toLocaleString()} (${ethChange >= 0 ? "+" : ""}${ethChange.toFixed(1)}%)`
  );
  console.log("");
}

main().catch((err) => {
  console.error("Failed to fetch prices:", err instanceof Error ? err.message : err);
  process.exit(1);
});
