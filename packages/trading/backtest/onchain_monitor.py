#!/usr/bin/env python3
"""
BODHI On-Chain Signal Dashboard
================================
Quick-run market condition monitor with aggregated trading signal.
Uses free public APIs only — no auth needed.

Run: python3 packages/trading/backtest/onchain_monitor.py
"""

import sys
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import ccxt
import requests

# ── Config ─────────────────────────────────────────────────────
UB_OFFSET_HOURS = 8  # UB (Ulaanbaatar) = UTC+8


# ── Data Fetching ──────────────────────────────────────────────

def fetch_btc_price():
    """BTC/USDT price + 24h change from Bybit."""
    try:
        exchange = ccxt.bybit({"enableRateLimit": True})
        ticker = exchange.fetch_ticker("BTC/USDT")
        return {
            "price": ticker["last"],
            "change_pct": ticker.get("percentage", 0) or 0,
            "ok": True,
        }
    except Exception as e:
        print(f"  [WARN] BTC price fetch failed: {e}")
        return {"price": 0, "change_pct": 0, "ok": False}


def fetch_eth_price():
    """ETH/USDT price + 24h change from Bybit."""
    try:
        exchange = ccxt.bybit({"enableRateLimit": True})
        ticker = exchange.fetch_ticker("ETH/USDT")
        return {
            "price": ticker["last"],
            "change_pct": ticker.get("percentage", 0) or 0,
            "ok": True,
        }
    except Exception as e:
        print(f"  [WARN] ETH price fetch failed: {e}")
        return {"price": 0, "change_pct": 0, "ok": False}


def fetch_200dma_ratio():
    """
    Price-to-200DMA ratio (proxy for MVRV).
    Fetch 220 daily candles, compute 200-day MA, return ratio.
    """
    try:
        exchange = ccxt.bybit({"enableRateLimit": True})
        since = int((datetime.now(timezone.utc) - timedelta(days=250)).timestamp() * 1000)
        candles = []
        while True:
            batch = exchange.fetch_ohlcv("BTC/USDT", "1d", since=since, limit=200)
            if not batch:
                break
            candles.extend(batch)
            new_since = batch[-1][0] + 1
            if new_since <= since or len(batch) < 100:
                break
            since = new_since
            time.sleep(0.3)

        if len(candles) < 200:
            return {"ratio": None, "ma200": None, "ok": False, "reason": f"only {len(candles)} candles"}

        closes = [c[4] for c in candles]
        ma200 = np.mean(closes[-200:])
        current = closes[-1]
        ratio = current / ma200

        return {"ratio": round(ratio, 3), "ma200": round(ma200, 2), "current": current, "ok": True}
    except Exception as e:
        print(f"  [WARN] 200DMA fetch failed: {e}")
        return {"ratio": None, "ma200": None, "ok": False, "reason": str(e)}


def fetch_fear_greed():
    """Fear & Greed Index from alternative.me (free, no auth)."""
    try:
        resp = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
        data = resp.json()
        entry = data["data"][0]
        return {
            "value": int(entry["value"]),
            "label": entry["value_classification"],
            "ok": True,
        }
    except Exception as e:
        print(f"  [WARN] Fear & Greed fetch failed: {e}")
        return {"value": None, "label": "N/A", "ok": False}


def fetch_btc_dominance():
    """BTC dominance from CoinGecko free API."""
    try:
        resp = requests.get("https://api.coingecko.com/api/v3/global", timeout=10)
        data = resp.json()
        dom = data["data"]["market_cap_percentage"]["btc"]
        return {"dominance": round(dom, 1), "ok": True}
    except Exception as e:
        print(f"  [WARN] BTC dominance fetch failed: {e}")
        return {"dominance": None, "ok": False}


def fetch_funding_rate():
    """Funding rate for BTCUSDT perpetual from Bybit public API."""
    try:
        resp = requests.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "linear", "symbol": "BTCUSDT"},
            timeout=10,
        )
        data = resp.json()
        if data["retCode"] == 0:
            ticker = data["result"]["list"][0]
            rate = float(ticker.get("fundingRate", 0))
            return {"rate": round(rate * 100, 4), "ok": True}  # convert to percentage
        return {"rate": None, "ok": False}
    except Exception as e:
        print(f"  [WARN] Funding rate fetch failed: {e}")
        return {"rate": None, "ok": False}


# ── Signal Aggregation ─────────────────────────────────────────

def classify_200dma(ratio):
    """Classify Price/200DMA ratio."""
    if ratio is None:
        return "N/A", "N/A", 0
    if ratio < 0.8:
        return "DEEP UNDERVALUE", "bullish", 1
    elif ratio < 1.2:
        return "FAIR VALUE", "neutral", 0
    elif ratio < 1.5:
        return "WARM", "neutral", 0
    elif ratio < 2.0:
        return "OVERHEATED", "bearish", -1
    else:
        return "EXTREME", "bearish", -1


def classify_fng(value):
    """Classify Fear & Greed (contrarian — fear = bullish)."""
    if value is None:
        return "N/A", "N/A", 0
    if value <= 25:
        return "EXTREME FEAR", "bullish", 1
    elif value <= 40:
        return "FEAR", "bullish", 1
    elif value <= 60:
        return "NEUTRAL", "neutral", 0
    elif value <= 75:
        return "GREED", "bearish", -1
    else:
        return "EXTREME GREED", "bearish", -1


def classify_funding(rate):
    """Classify funding rate."""
    if rate is None:
        return "N/A", "N/A", 0
    if rate < -0.01:
        return "negative (shorts pay)", "bullish", 1
    elif rate > 0.03:
        return "elevated (longs pay)", "bearish", -1
    else:
        return "neutral", "neutral", 0


def classify_dominance(dom):
    """BTC dominance — high dominance = risk-off = accumulate BTC."""
    if dom is None:
        return "N/A", "N/A", 0
    if dom > 55:
        return "BTC dominant", "bullish", 1
    elif dom < 40:
        return "alt season", "bearish", -1
    else:
        return "balanced", "neutral", 0


# ── Display ────────────────────────────────────────────────────

def bar_chart(value, max_val, width=10):
    """Simple text bar chart."""
    if value is None:
        return " " * width
    filled = int((value / max_val) * width)
    filled = max(0, min(width, filled))
    return "\u25a0" * filled + "\u2591" * (width - filled)


def format_price_line(symbol, price, change_pct):
    """Format a price line with alignment."""
    sign = "+" if change_pct >= 0 else ""
    price_str = f"${price:,.0f}"
    return f"  {symbol:<12} {price_str:<12} {sign}{change_pct:.1f}% 24h"


def print_dashboard(btc, eth, dma, fng, dom, funding):
    """Print the formatted signal dashboard."""
    now_utc = datetime.now(timezone.utc)
    now_ub = now_utc + timedelta(hours=UB_OFFSET_HOURS)

    # Classify all signals
    dma_label, dma_bias, dma_score = classify_200dma(dma["ratio"])
    fng_label, fng_bias, fng_score = classify_fng(fng["value"])
    fund_label, fund_bias, fund_score = classify_funding(funding["rate"])
    dom_label, dom_bias, dom_score = classify_dominance(dom["dominance"])

    # Aggregate: count bullish signals out of 4
    signals = [dma_score, fng_score, fund_score, dom_score]
    bullish_count = sum(1 for s in signals if s > 0)
    bearish_count = sum(1 for s in signals if s < 0)

    if bullish_count >= 3:
        overall = "ACCUMULATE"
        dca_mod = "2x (double this week's buy)"
    elif bullish_count >= 2:
        overall = "NORMAL DCA"
        dca_mod = "1x (standard weekly buy)"
    elif bullish_count == 1:
        overall = "REDUCE"
        dca_mod = "0.5x (half this week's buy)"
    else:
        overall = "SKIP"
        dca_mod = "0x (skip this week)"

    w = 50  # box width

    print()
    print("\u2554" + "\u2550" * w + "\u2557")
    print("\u2551" + "BODHI On-Chain Signal Dashboard".center(w) + "\u2551")
    print("\u2551" + f"{now_utc.strftime('%Y-%m-%d %H:%M')} UTC / {now_ub.strftime('%H:%M')} UB".center(w) + "\u2551")
    print("\u2560" + "\u2550" * w + "\u2563")

    # Prices
    if btc["ok"]:
        print("\u2551" + format_price_line("BTC/USDT", btc["price"], btc["change_pct"]).ljust(w) + "\u2551")
    else:
        print("\u2551" + "  BTC/USDT     [fetch failed]".ljust(w) + "\u2551")

    if eth["ok"]:
        print("\u2551" + format_price_line("ETH/USDT", eth["price"], eth["change_pct"]).ljust(w) + "\u2551")
    else:
        print("\u2551" + "  ETH/USDT     [fetch failed]".ljust(w) + "\u2551")

    print("\u2560" + "\u2550" * w + "\u2563")

    # Indicators
    if dma["ok"]:
        bar = bar_chart(dma["ratio"], 2.5)
        print("\u2551" + f"  Price/200DMA  {dma['ratio']:.2f}  {bar}  {dma_label}".ljust(w) + "\u2551")
    else:
        print("\u2551" + "  Price/200DMA  [unavailable]".ljust(w) + "\u2551")

    if fng["ok"]:
        bar = bar_chart(fng["value"], 100)
        print("\u2551" + f"  Fear & Greed  {fng['value']:<4d} {bar}  {fng_label}".ljust(w) + "\u2551")
    else:
        print("\u2551" + "  Fear & Greed  [unavailable]".ljust(w) + "\u2551")

    if dom["ok"]:
        print("\u2551" + f"  BTC Dominance {dom['dominance']}%".ljust(w) + "\u2551")
    else:
        print("\u2551" + "  BTC Dominance [unavailable]".ljust(w) + "\u2551")

    if funding["ok"]:
        print("\u2551" + f"  Funding Rate  {funding['rate']:.4f}%  ({fund_label})".ljust(w) + "\u2551")
    else:
        print("\u2551" + "  Funding Rate  [unavailable]".ljust(w) + "\u2551")

    print("\u2560" + "\u2550" * w + "\u2563")

    # Signal
    print("\u2551" + f"  SIGNAL: {overall} ({bullish_count}/4 bullish)".ljust(w) + "\u2551")
    print("\u2551" + f"  DCA modifier: {dca_mod}".ljust(w) + "\u2551")

    print("\u255a" + "\u2550" * w + "\u255d")
    print()


# ── JSON Output ───────────────────────────────────────────────

def build_snapshot(btc, eth, dma, fng, dom, funding):
    """Build a machine-readable snapshot dict from all fetched data."""
    now_utc = datetime.now(timezone.utc)

    # Classify all signals
    dma_label, dma_bias, dma_score = classify_200dma(dma["ratio"])
    fng_label, fng_bias, fng_score = classify_fng(fng["value"])
    fund_label, fund_bias, fund_score = classify_funding(funding["rate"])
    dom_label, dom_bias, dom_score = classify_dominance(dom["dominance"])

    signals = [dma_score, fng_score, fund_score, dom_score]
    bullish_count = sum(1 for s in signals if s > 0)

    if bullish_count >= 3:
        signal = "ACCUMULATE"
        dca_multiplier = 2
    elif bullish_count >= 2:
        signal = "NORMAL_DCA"
        dca_multiplier = 1
    elif bullish_count == 1:
        signal = "REDUCE"
        dca_multiplier = 0.5
    else:
        signal = "SKIP"
        dca_multiplier = 0

    return {
        "timestamp": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "btc_price": btc["price"] if btc["ok"] else None,
        "eth_price": eth["price"] if eth["ok"] else None,
        "btc_24h_pct": round(btc["change_pct"], 2) if btc["ok"] else None,
        "price_to_200dma": dma["ratio"] if dma["ok"] else None,
        "fear_greed": fng["value"] if fng["ok"] else None,
        "btc_dominance": dom["dominance"] if dom["ok"] else None,
        "funding_rate": funding["rate"] if funding["ok"] else None,
        "bullish_count": bullish_count,
        "signal": signal,
        "dca_multiplier": dca_multiplier,
    }


# ── Main ───────────────────────────────────────────────────────

def main():
    import json as _json

    json_mode = "--json" in sys.argv

    if not json_mode:
        print("Fetching market data...\n")

    # Fetch all data (sequential to respect rate limits)
    btc = fetch_btc_price()
    eth = fetch_eth_price()

    if not json_mode:
        print("  Fetching 200-day MA data...")
    dma = fetch_200dma_ratio()

    if not json_mode:
        print("  Fetching Fear & Greed index...")
    fng = fetch_fear_greed()

    if not json_mode:
        print("  Fetching BTC dominance...")
    dom = fetch_btc_dominance()

    if not json_mode:
        print("  Fetching funding rate...")
    funding = fetch_funding_rate()

    if json_mode:
        snapshot = build_snapshot(btc, eth, dma, fng, dom, funding)
        print(_json.dumps(snapshot))
    else:
        print_dashboard(btc, eth, dma, fng, dom, funding)


if __name__ == "__main__":
    main()
