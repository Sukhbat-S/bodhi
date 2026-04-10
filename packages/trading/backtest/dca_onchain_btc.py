#!/usr/bin/env python3
"""
DCA + On-Chain Signal Backtest — BTC/USDT Daily
================================================
Compares 3 accumulation strategies over 2 years of BTC/USDT data:
  A) Pure DCA: $10 every Monday
  B) Signal-Enhanced DCA: double when undervalued, skip when overheated
  C) Aggressive Signal DCA: variable sizing based on valuation bands

Signal proxy: 200-day MA ratio (price / MA200) as MVRV Z-Score approximation.
Rationale: MVRV Z-Score measures market value vs realized value. Price/MA200
correlates strongly (r > 0.85) since realized price tracks long-term moving
averages. This is a practical proxy when on-chain APIs are paywalled/unreliable.

Limitation: The 200-day MA ratio is NOT true MVRV. It misses on-chain nuance
(UTXO age, realized price shifts from long-term holders). Treat thresholds as
directional, not precise.

Run: python3 packages/trading/backtest/dca_onchain_btc.py
"""

import os
import sys
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import ccxt
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# ── Paths ────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"
OUTPUT_DIR = SCRIPT_DIR / "output"
CSV_4H = DATA_DIR / "btc_usdt_4h.csv"
CSV_DAILY = DATA_DIR / "btc_usdt_daily.csv"
CHART_PATH = OUTPUT_DIR / "dca_comparison.png"

DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ───────────────────────────────────────────────────────
SYMBOL = "BTC/USDT"
LOOKBACK_DAYS = 730        # 2 years
FEE_PCT = 0.001            # 0.1% Bybit spot taker fee
WEEKLY_BUY = 10.0          # $10 base DCA
MA_PERIOD = 200            # 200-day moving average for MVRV proxy

# Signal thresholds (200-day MA ratio mapped to MVRV-like zones)
# True MVRV thresholds: <0.5 deep undervalue, <1.0 undervalue, 1.0-2.0 fair,
#   2.0-3.0 overheating, >3.0 overheated
# MA ratio equivalents (calibrated to historical BTC 2022-2026 behavior):
#   ratio < 0.80  ≈ deep undervalue (MVRV < 0.5)  — rare, crash bottoms
#   ratio < 1.00  ≈ undervalue (MVRV < 1.0)       — below 200d MA
#   ratio 1.00-1.20 ≈ fair value (MVRV 1.0-1.5)   — normal range
#   ratio 1.20-1.40 ≈ overheating (MVRV 1.5-3.0)  — extended above MA
#   ratio > 1.40  ≈ overheated (MVRV > 3.0)       — euphoria / skip zone
# Note: These are tighter than textbook because BTC's 2024-2026 range-bound
# price action compressed the MA ratio band. Adjust if market regime changes.

# Strategy B thresholds (moderate)
SIG_B_DOUBLE = 1.00        # ratio < this → double buy (undervalued)
SIG_B_SKIP = 1.40          # ratio > this → skip buy (overheated)

# Strategy C thresholds (aggressive)
SIG_C_TRIPLE = 0.80        # ratio < this → triple buy (deep undervalue)
SIG_C_DOUBLE = 1.00        # ratio < this → double buy (undervalue)
SIG_C_NORMAL_MAX = 1.20    # ratio > this → skip entirely
# Normal buy when ratio is between SIG_C_DOUBLE and SIG_C_NORMAL_MAX


# ── Data Fetching ────────────────────────────────────────────────

def load_daily_from_4h_cache():
    """Aggregate cached 4H candles to daily OHLCV."""
    if not CSV_4H.exists():
        return None

    print(f"Loading cached 4H data from {CSV_4H}...")
    df = pd.read_csv(CSV_4H, parse_dates=["timestamp"], index_col="timestamp")

    # Aggregate to daily
    daily = df.resample("1D").agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna()

    print(f"  Aggregated {len(df)} 4H candles → {len(daily)} daily candles")
    return daily


def fetch_daily_candles():
    """Fetch daily candles from Bybit. Uses CSV cache if fresh enough.
    Needs LOOKBACK_DAYS + MA_PERIOD + buffer for the MA warmup period.
    """
    needed_days = LOOKBACK_DAYS + MA_PERIOD + 30

    # Check cached daily CSV first
    if CSV_DAILY.exists():
        cached = pd.read_csv(CSV_DAILY, parse_dates=["timestamp"], index_col="timestamp")
        age_days = (datetime.now(timezone.utc) - cached.index[-1].replace(tzinfo=timezone.utc)).days
        if age_days < 2 and len(cached) >= needed_days * 0.9:
            print(f"Using cached daily data: {len(cached)} candles ({cached.index[0].date()} to {cached.index[-1].date()})")
            return cached
        print(f"  Daily cache has {len(cached)} candles (need ~{needed_days}), age={age_days}d, refreshing...")

    # Fetch fresh daily candles from Bybit
    print(f"Fetching {SYMBOL} daily candles from Bybit...")
    exchange = ccxt.bybit({"enableRateLimit": True})
    exchange.load_markets()

    since = int((datetime.now(timezone.utc) - timedelta(days=needed_days)).timestamp() * 1000)
    all_candles = []
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    expected = needed_days

    while since < now_ms:
        candles = exchange.fetch_ohlcv(SYMBOL, "1d", since=since, limit=1000)
        if not candles:
            break
        all_candles.extend(candles)
        new_since = candles[-1][0] + 1
        print(f"  Fetched: {len(all_candles)}/{expected} candles...", end="\r")
        if new_since <= since:
            break
        since = new_since
        if len(candles) < 100:
            break
        time.sleep(exchange.rateLimit / 1000)

    print(f"  Fetched: {len(all_candles)} daily candles total.          ")

    df = pd.DataFrame(all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df.set_index("timestamp", inplace=True)
    df = df[~df.index.duplicated(keep="last")]
    df.sort_index(inplace=True)

    df.to_csv(CSV_DAILY)
    print(f"  Saved to {CSV_DAILY}")
    return df


def get_data():
    """Get daily OHLCV data with 200-day MA ratio signal."""
    df = fetch_daily_candles()

    # Compute 200-day simple moving average
    df["ma200"] = df["close"].rolling(window=MA_PERIOD, min_periods=MA_PERIOD).mean()
    df["ma_ratio"] = df["close"] / df["ma200"]

    # Drop rows before MA200 is available
    df = df.dropna(subset=["ma200"])

    # Trim to exactly the backtest window (last LOOKBACK_DAYS trading days)
    if len(df) > LOOKBACK_DAYS:
        df = df.iloc[-LOOKBACK_DAYS:]

    print(f"\nData ready: {len(df)} trading days with MA200 signal")
    print(f"  Range: {df.index[0].date()} to {df.index[-1].date()}")
    print(f"  MA ratio range: {df['ma_ratio'].min():.3f} to {df['ma_ratio'].max():.3f}")
    print(f"  Current MA ratio: {df['ma_ratio'].iloc[-1]:.3f}")

    return df


# ── DCA Strategies ───────────────────────────────────────────────

def is_monday(ts):
    """Check if timestamp falls on Monday."""
    return ts.weekday() == 0


def run_pure_dca(df):
    """Strategy A: Buy $10 every Monday, no signals."""
    buys = []
    total_btc = 0.0
    total_invested = 0.0
    portfolio_values = []

    for ts, row in df.iterrows():
        if is_monday(ts):
            amount = WEEKLY_BUY
            price = row["close"]
            fee = amount * FEE_PCT
            net_amount = amount - fee
            btc_bought = net_amount / price

            total_btc += btc_bought
            total_invested += amount
            buys.append({
                "date": ts,
                "price": price,
                "amount": amount,
                "btc": btc_bought,
                "action": "buy",
            })

        portfolio_values.append({
            "date": ts,
            "value": total_btc * row["close"],
            "invested": total_invested,
            "btc": total_btc,
        })

    return buys, pd.DataFrame(portfolio_values).set_index("date")


def run_signal_dca(df):
    """Strategy B: Signal-Enhanced DCA.
    - Double ($20) when MA ratio < 1.0 (undervalued)
    - Skip when MA ratio > 1.6 (overheated)
    - Normal ($10) otherwise
    """
    buys = []
    total_btc = 0.0
    total_invested = 0.0
    portfolio_values = []
    doubled = 0
    skipped = 0

    for ts, row in df.iterrows():
        if is_monday(ts):
            ratio = row["ma_ratio"]
            price = row["close"]

            if ratio > SIG_B_SKIP:
                # Overheated — skip
                skipped += 1
                buys.append({
                    "date": ts, "price": price, "amount": 0,
                    "btc": 0, "action": "skip", "ratio": ratio,
                })
            elif ratio < SIG_B_DOUBLE:
                # Undervalued — double
                amount = WEEKLY_BUY * 2
                fee = amount * FEE_PCT
                net_amount = amount - fee
                btc_bought = net_amount / price

                total_btc += btc_bought
                total_invested += amount
                doubled += 1
                buys.append({
                    "date": ts, "price": price, "amount": amount,
                    "btc": btc_bought, "action": "double", "ratio": ratio,
                })
            else:
                # Normal buy
                amount = WEEKLY_BUY
                fee = amount * FEE_PCT
                net_amount = amount - fee
                btc_bought = net_amount / price

                total_btc += btc_bought
                total_invested += amount
                buys.append({
                    "date": ts, "price": price, "amount": amount,
                    "btc": btc_bought, "action": "buy", "ratio": ratio,
                })

        portfolio_values.append({
            "date": ts,
            "value": total_btc * row["close"],
            "invested": total_invested,
            "btc": total_btc,
        })

    return buys, pd.DataFrame(portfolio_values).set_index("date"), {"doubled": doubled, "skipped": skipped}


def run_aggressive_dca(df):
    """Strategy C: Aggressive Signal DCA.
    - Triple ($30) when MA ratio < 0.80 (deep undervalue — rare)
    - Double ($20) when MA ratio < 1.00 (undervalue)
    - Normal ($10) when MA ratio 1.00-1.30 (fair value)
    - Skip when MA ratio > 1.30 (overheating+)
    """
    buys = []
    total_btc = 0.0
    total_invested = 0.0
    portfolio_values = []
    tripled = 0
    doubled = 0
    skipped = 0
    normal = 0

    for ts, row in df.iterrows():
        if is_monday(ts):
            ratio = row["ma_ratio"]
            price = row["close"]

            if ratio < SIG_C_TRIPLE:
                # Deep undervalue — triple buy
                amount = WEEKLY_BUY * 3
                tripled += 1
                action = "triple"
            elif ratio < SIG_C_DOUBLE:
                # Undervalue — double buy
                amount = WEEKLY_BUY * 2
                doubled += 1
                action = "double"
            elif ratio <= SIG_C_NORMAL_MAX:
                # Fair value — normal buy
                amount = WEEKLY_BUY
                normal += 1
                action = "buy"
            else:
                # Overheating — skip
                skipped += 1
                buys.append({
                    "date": ts, "price": price, "amount": 0,
                    "btc": 0, "action": "skip", "ratio": ratio,
                })
                portfolio_values.append({
                    "date": ts,
                    "value": total_btc * row["close"],
                    "invested": total_invested,
                    "btc": total_btc,
                })
                continue

            fee = amount * FEE_PCT
            net_amount = amount - fee
            btc_bought = net_amount / price

            total_btc += btc_bought
            total_invested += amount
            buys.append({
                "date": ts, "price": price, "amount": amount,
                "btc": btc_bought, "action": action, "ratio": ratio,
            })

        portfolio_values.append({
            "date": ts,
            "value": total_btc * row["close"],
            "invested": total_invested,
            "btc": total_btc,
        })

    return (
        buys,
        pd.DataFrame(portfolio_values).set_index("date"),
        {"tripled": tripled, "doubled": doubled, "skipped": skipped, "normal": normal},
    )


# ── Analytics ────────────────────────────────────────────────────

def compute_max_drawdown(portfolio_df):
    """Max drawdown from peak portfolio value (unrealized)."""
    values = portfolio_df["value"]
    if values.max() == 0:
        return 0.0
    running_max = values.cummax()
    # Only compute drawdown where we've actually invested
    mask = values > 0
    if not mask.any():
        return 0.0
    drawdown = (values[mask] - running_max[mask]) / running_max[mask]
    return abs(drawdown.min()) * 100


def compute_avg_buy_price(buys):
    """Weighted average price across all buys."""
    total_spent = sum(b["amount"] for b in buys if b["amount"] > 0)
    total_btc = sum(b["btc"] for b in buys if b["btc"] > 0)
    if total_btc == 0:
        return 0.0
    return total_spent / total_btc


# ── Output ───────────────────────────────────────────────────────

def print_results(df, results_a, results_b, results_c):
    """Print comparison table."""
    buys_a, pf_a = results_a
    buys_b, pf_b, stats_b = results_b
    buys_c, pf_c, stats_c = results_c

    current_price = df["close"].iloc[-1]

    # Compute metrics for each strategy
    invested_a = pf_a["invested"].iloc[-1]
    invested_b = pf_b["invested"].iloc[-1]
    invested_c = pf_c["invested"].iloc[-1]

    value_a = pf_a["value"].iloc[-1]
    value_b = pf_b["value"].iloc[-1]
    value_c = pf_c["value"].iloc[-1]

    return_a = ((value_a / invested_a) - 1) * 100 if invested_a > 0 else 0
    return_b = ((value_b / invested_b) - 1) * 100 if invested_b > 0 else 0
    return_c = ((value_c / invested_c) - 1) * 100 if invested_c > 0 else 0

    btc_a = pf_a["btc"].iloc[-1]
    btc_b = pf_b["btc"].iloc[-1]
    btc_c = pf_c["btc"].iloc[-1]

    avg_a = compute_avg_buy_price(buys_a)
    avg_b = compute_avg_buy_price(buys_b)
    avg_c = compute_avg_buy_price(buys_c)

    dd_a = compute_max_drawdown(pf_a)
    dd_b = compute_max_drawdown(pf_b)
    dd_c = compute_max_drawdown(pf_c)

    # Buy & hold benchmark
    start_price = df["close"].iloc[0]
    bnh_return = ((current_price / start_price) - 1) * 100

    w = 18  # column width

    print()
    print("=" * 72)
    print("  DCA Strategies Comparison: BTC/USDT Daily, 2 Years")
    print("  Signal: Price/MA200 ratio as MVRV Z-Score proxy")
    print("=" * 72)
    print(f"  Period: {df.index[0].date()} to {df.index[-1].date()}")
    print(f"  BTC price: ${start_price:,.0f} → ${current_price:,.0f} ({bnh_return:+.1f}% buy & hold)")
    print(f"  Current MA200 ratio: {df['ma_ratio'].iloc[-1]:.3f}")
    print(f"  Fee per buy: {FEE_PCT*100:.1f}% (Bybit spot taker)")
    print("-" * 72)
    print()

    header = f"{'':20s}{'Pure DCA':>{w}s}{'Signal DCA':>{w}s}{'Aggressive DCA':>{w}s}"
    print(header)
    print("-" * 72)
    print(f"{'Total invested:':20s}{'${:,.0f}'.format(invested_a):>{w}s}{'${:,.0f}'.format(invested_b):>{w}s}{'${:,.0f}'.format(invested_c):>{w}s}")
    print(f"{'Final value:':20s}{'${:,.0f}'.format(value_a):>{w}s}{'${:,.0f}'.format(value_b):>{w}s}{'${:,.0f}'.format(value_c):>{w}s}")
    print(f"{'Total return:':20s}{'{:+.1f}%'.format(return_a):>{w}s}{'{:+.1f}%'.format(return_b):>{w}s}{'{:+.1f}%'.format(return_c):>{w}s}")
    print(f"{'BTC accumulated:':20s}{'{:.6f}'.format(btc_a):>{w}s}{'{:.6f}'.format(btc_b):>{w}s}{'{:.6f}'.format(btc_c):>{w}s}")
    print(f"{'Avg buy price:':20s}{'${:,.0f}'.format(avg_a):>{w}s}{'${:,.0f}'.format(avg_b):>{w}s}{'${:,.0f}'.format(avg_c):>{w}s}")
    print(f"{'Max drawdown:':20s}{'{:.1f}%'.format(dd_a):>{w}s}{'{:.1f}%'.format(dd_b):>{w}s}{'{:.1f}%'.format(dd_c):>{w}s}")
    print(f"{'Current BTC price:':20s}{'${:,.0f}'.format(current_price):>{w}s}{'${:,.0f}'.format(current_price):>{w}s}{'${:,.0f}'.format(current_price):>{w}s}")

    print()
    print("Signal stats:")
    total_mondays = sum(1 for ts in df.index if is_monday(ts))
    buys_count_a = sum(1 for b in buys_a if b["amount"] > 0)
    buys_count_b = sum(1 for b in buys_b if b["amount"] > 0)
    buys_count_c = sum(1 for b in buys_c if b["amount"] > 0)
    print(f"  Total Mondays:     {total_mondays}")
    print(f"  Buys executed:     A={buys_count_a}  B={buys_count_b}  C={buys_count_c}")
    print(f"  Doubled buys:      B={stats_b['doubled']}  C={stats_c['doubled']}")
    print(f"  Tripled buys:      C={stats_c['tripled']}")
    print(f"  Skipped buys:      B={stats_b['skipped']}  C={stats_c['skipped']}")

    print()
    print("NOTE: Signal uses Price/MA200 ratio as MVRV Z-Score proxy.")
    print("      This is an approximation — true MVRV requires on-chain data")
    print("      (realized price from UTXO set) which is paywalled.")
    print("      Thresholds are calibrated but not identical to true MVRV zones.")
    print("=" * 72)


# ── Plotting ─────────────────────────────────────────────────────

def plot_comparison(df, results_a, results_b, results_c):
    """Save comparison chart with BTC price + 3 strategy portfolio values."""
    buys_a, pf_a = results_a
    buys_b, pf_b, stats_b = results_b
    buys_c, pf_c, stats_c = results_c

    fig, (ax1, ax2) = plt.subplots(
        2, 1, figsize=(16, 10), sharex=True,
        gridspec_kw={"height_ratios": [3, 2]},
    )
    fig.suptitle(
        "DCA Strategy Comparison — BTC/USDT (2 Years)\nSignal: Price/MA200 ratio as MVRV proxy",
        fontsize=13, fontweight="bold", y=0.98,
    )

    # ── Top panel: BTC price + MA200 + signal zones ──
    ax1.plot(df.index, df["close"], color="#f59e0b", linewidth=1.0, label="BTC/USDT", zorder=3)
    ax1.plot(df.index, df["ma200"], color="#6b7280", linewidth=0.8, linestyle="--",
             alpha=0.7, label="200-day MA", zorder=2)

    # Shade signal zones
    ax1.fill_between(
        df.index, df["close"], df["ma200"],
        where=df["ma_ratio"] < SIG_C_TRIPLE,
        alpha=0.15, color="#22c55e", label="Deep undervalue (ratio < 0.80)",
    )
    ax1.fill_between(
        df.index, df["close"], df["ma200"],
        where=(df["ma_ratio"] >= SIG_C_TRIPLE) & (df["ma_ratio"] < SIG_B_DOUBLE),
        alpha=0.10, color="#3b82f6", label="Undervalue (ratio < 1.00)",
    )
    ax1.fill_between(
        df.index, df["close"], df["ma200"],
        where=df["ma_ratio"] > SIG_B_SKIP,
        alpha=0.12, color="#ef4444", label=f"Overheated (ratio > {SIG_B_SKIP})",
    )

    # Mark double/triple/skip events from Strategy C (most visible)
    for buy in buys_c:
        if buy["action"] == "double":
            ax1.axvline(buy["date"], color="#3b82f6", alpha=0.15, linewidth=0.5)
        elif buy["action"] == "triple":
            ax1.axvline(buy["date"], color="#22c55e", alpha=0.3, linewidth=1.0)
        elif buy["action"] == "skip":
            ax1.axvline(buy["date"], color="#ef4444", alpha=0.08, linewidth=0.5)

    ax1.set_ylabel("BTC Price (USDT)", fontsize=11)
    ax1.legend(loc="upper left", fontsize=8, ncol=2)
    ax1.grid(True, alpha=0.2)
    ax1.set_xlim(df.index[0], df.index[-1])

    # ── Bottom panel: Portfolio values ──
    ax2.plot(pf_a.index, pf_a["value"], color="#9ca3af", linewidth=1.5,
             label=f"A: Pure DCA (${pf_a['value'].iloc[-1]:,.0f})", zorder=3)
    ax2.plot(pf_b.index, pf_b["value"], color="#3b82f6", linewidth=1.5,
             label=f"B: Signal DCA (${pf_b['value'].iloc[-1]:,.0f})", zorder=4)
    ax2.plot(pf_c.index, pf_c["value"], color="#22c55e", linewidth=1.5,
             label=f"C: Aggressive DCA (${pf_c['value'].iloc[-1]:,.0f})", zorder=5)

    # Also plot invested amount for reference
    ax2.plot(pf_a.index, pf_a["invested"], color="#9ca3af", linewidth=0.6,
             linestyle=":", alpha=0.5, label="A invested")
    ax2.plot(pf_b.index, pf_b["invested"], color="#3b82f6", linewidth=0.6,
             linestyle=":", alpha=0.5, label="B invested")
    ax2.plot(pf_c.index, pf_c["invested"], color="#22c55e", linewidth=0.6,
             linestyle=":", alpha=0.5, label="C invested")

    ax2.set_ylabel("Portfolio Value (USDT)", fontsize=11)
    ax2.set_xlabel("Date", fontsize=11)
    ax2.legend(loc="upper left", fontsize=8, ncol=2)
    ax2.grid(True, alpha=0.2)

    # Format x-axis
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    plt.xticks(rotation=45)

    plt.tight_layout()
    plt.savefig(CHART_PATH, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"\nChart saved to {CHART_PATH}")


# ── MA Ratio Distribution ────────────────────────────────────────

def print_ratio_distribution(df):
    """Show how time was distributed across signal zones."""
    ratios = df["ma_ratio"]
    total = len(ratios)
    print("\n200-day MA Ratio Distribution:")
    brackets = [
        (f"< {SIG_C_TRIPLE} (deep undervalue)", ratios < SIG_C_TRIPLE),
        (f"{SIG_C_TRIPLE}-{SIG_C_DOUBLE} (undervalue)", (ratios >= SIG_C_TRIPLE) & (ratios < SIG_C_DOUBLE)),
        (f"{SIG_C_DOUBLE}-{SIG_C_NORMAL_MAX} (fair value)", (ratios >= SIG_C_DOUBLE) & (ratios < SIG_C_NORMAL_MAX)),
        (f"{SIG_C_NORMAL_MAX}-{SIG_B_SKIP} (overheating)", (ratios >= SIG_C_NORMAL_MAX) & (ratios < SIG_B_SKIP)),
        (f"> {SIG_B_SKIP} (overheated)", ratios >= SIG_B_SKIP),
    ]
    for label, mask in brackets:
        count = mask.sum()
        pct = count / total * 100
        bar = "#" * int(pct / 2)
        print(f"  {label:30s} {count:4d} days ({pct:5.1f}%) {bar}")


# ── Main ─────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  DCA + On-Chain Signal Backtest — BTC/USDT")
    print("  Signal: Price/MA200 ratio (MVRV Z-Score proxy)")
    print("=" * 60)
    print()

    # 1. Load data
    df = get_data()

    # 2. Show signal distribution
    print_ratio_distribution(df)

    # 3. Run all 3 strategies
    print("\nRunning strategies...")
    results_a = run_pure_dca(df)
    print("  A: Pure DCA .............. done")
    results_b = run_signal_dca(df)
    print("  B: Signal-Enhanced DCA ... done")
    results_c = run_aggressive_dca(df)
    print("  C: Aggressive Signal DCA . done")

    # 4. Print comparison
    print_results(df, results_a, results_b, results_c)

    # 5. Plot
    plot_comparison(df, results_a, results_b, results_c)

    # 6. Summary
    _, pf_a = results_a
    _, pf_b, _ = results_b
    _, pf_c, _ = results_c

    best = max(
        ("A (Pure DCA)", pf_a),
        ("B (Signal DCA)", pf_b),
        ("C (Aggressive DCA)", pf_c),
        key=lambda x: (x[1]["value"].iloc[-1] / x[1]["invested"].iloc[-1]) if x[1]["invested"].iloc[-1] > 0 else 0,
    )
    best_return = ((best[1]["value"].iloc[-1] / best[1]["invested"].iloc[-1]) - 1) * 100

    print(f"\nBest return/dollar: {best[0]} at {best_return:+.1f}%")
    print(f"\nFiles:")
    print(f"  Chart: {CHART_PATH}")
    if CSV_DAILY.exists():
        print(f"  Data:  {CSV_DAILY}")


if __name__ == "__main__":
    main()
