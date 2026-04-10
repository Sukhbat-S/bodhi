#!/usr/bin/env python3
"""
Grid Bot Backtest — BTC/USDT Daily, 2 Years
============================================
Simulates a spot grid bot that profits from price oscillation.
Adaptive grid re-centers every 30 days based on 90-day rolling range.

Run: python3 packages/trading/backtest/grid_bot_btc.py
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
matplotlib.use("Agg")  # headless — no display needed
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# ── Paths ──────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"
OUTPUT_DIR = SCRIPT_DIR / "output"
CSV_PATH = DATA_DIR / "btc_usdt_daily.csv"

DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ─────────────────────────────────────────────────────
SYMBOL = "BTC/USDT"
TIMEFRAME = "1d"
LOOKBACK_DAYS = 730
INITIAL_CAPITAL = 100.0
FEE_PCT = 0.001          # 0.1% per side
NUM_GRIDS = 15
RECENTER_DAYS = 30        # re-center grid every N days
RANGE_LOOKBACK = 90       # 90-day rolling high/low for grid range
RANGE_BUFFER = 0.10       # 10% buffer beyond range


# ── Data Fetching ──────────────────────────────────────────────

def fetch_daily_ohlcv():
    """Download BTC/USDT daily candles from Bybit. Uses CSV cache."""
    if CSV_PATH.exists():
        df = pd.read_csv(CSV_PATH, parse_dates=["timestamp"], index_col="timestamp")
        age_days = (datetime.now(timezone.utc) - df.index[-1].replace(tzinfo=timezone.utc)).days
        if age_days < 1:
            print(f"Using cached data: {len(df)} candles ({df.index[0].date()} to {df.index[-1].date()})")
            return df
        else:
            print(f"Cache is {age_days} day(s) old, refreshing...")

    exchange = ccxt.bybit({"enableRateLimit": True})
    exchange.load_markets()

    since = int((datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).timestamp() * 1000)
    all_candles = []
    expected = LOOKBACK_DAYS
    limit = 1000

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    print(f"Fetching {SYMBOL} {TIMEFRAME} candles from Bybit...")
    while since < now_ms:
        candles = exchange.fetch_ohlcv(SYMBOL, TIMEFRAME, since=since, limit=limit)
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

    print(f"  Fetched: {len(all_candles)} candles total.          ")

    df = pd.DataFrame(all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df.set_index("timestamp", inplace=True)
    df = df[~df.index.duplicated(keep="last")]
    df.sort_index(inplace=True)

    df.to_csv(CSV_PATH)
    print(f"Saved to {CSV_PATH}")
    return df


# ── Grid Logic ─────────────────────────────────────────────────

def compute_grid_levels(high, low, n_levels):
    """Create evenly-spaced grid levels between low and high."""
    return np.linspace(low, high, n_levels + 2)[1:-1]  # exclude exact bounds


def compute_range(df, idx, lookback):
    """90-day rolling high/low with buffer."""
    start = max(0, idx - lookback)
    window = df.iloc[start:idx + 1]
    high = window["high"].max()
    low = window["low"].min()
    # Add buffer
    spread = high - low
    return low - spread * RANGE_BUFFER, high + spread * RANGE_BUFFER


# ── Backtest Engine ────────────────────────────────────────────

def run_grid_backtest(df):
    """
    Simulate spot grid bot:
    - Divide capital equally across grid levels
    - When price crosses DOWN through a level: buy (place BTC on that level)
    - When price crosses UP through a level: sell (realize profit)
    - Re-center grid every RECENTER_DAYS days
    """
    close = df["close"].values
    highs = df["high"].values
    lows = df["low"].values
    timestamps = df.index
    n = len(close)

    # State tracking
    cash = INITIAL_CAPITAL
    btc_held = 0.0                   # total BTC accumulated
    capital_per_grid = INITIAL_CAPITAL / NUM_GRIDS
    realized_profit = 0.0
    total_buys = 0
    total_sells = 0
    cycle_profits = []

    # Grid state: each level tracks if it has an open buy (holding BTC)
    grid_levels = np.array([])
    grid_has_buy = {}  # level_idx -> (buy_price, btc_amount)
    last_recenter = 0

    # Equity tracking
    equity_values = []
    equity_dates = []

    # Monthly returns
    monthly_equity = {}

    for i in range(RANGE_LOOKBACK, n):
        # Re-center grid every RECENTER_DAYS or on first iteration
        if i == RANGE_LOOKBACK or (i - last_recenter) >= RECENTER_DAYS:
            range_low, range_high = compute_range(df, i, RANGE_LOOKBACK)
            old_levels = grid_levels.copy() if len(grid_levels) > 0 else np.array([])
            grid_levels = compute_grid_levels(range_high, range_low, NUM_GRIDS)

            # Close positions on levels that no longer exist (within 0.5% tolerance)
            new_grid_has_buy = {}
            for old_idx, (buy_price, btc_amt) in grid_has_buy.items():
                # Try to map old position to nearest new level
                if len(grid_levels) > 0 and old_idx < len(old_levels):
                    old_price = old_levels[old_idx]
                    dists = np.abs(grid_levels - old_price)
                    nearest = np.argmin(dists)
                    if dists[nearest] / old_price < 0.005 and nearest not in new_grid_has_buy:
                        new_grid_has_buy[nearest] = (buy_price, btc_amt)
                    else:
                        # Force close at current price
                        sell_price = close[i] * (1 - FEE_PCT)
                        profit = (sell_price - buy_price) * btc_amt
                        realized_profit += profit
                        cash += sell_price * btc_amt
                        btc_held -= btc_amt
                        total_sells += 1
                        cycle_profits.append(profit)

            grid_has_buy = new_grid_has_buy
            last_recenter = i
            # Recalculate capital per grid based on current cash
            capital_per_grid = max(cash / NUM_GRIDS, 0.0)

        # Simulate price action through today's candle
        day_low = lows[i]
        day_high = highs[i]
        prev_close = close[i - 1] if i > 0 else close[i]

        for level_idx, level_price in enumerate(grid_levels):
            if level_idx in grid_has_buy:
                # Has open buy — check if price crossed UP through this level to sell
                if day_high >= level_price and prev_close < level_price:
                    buy_price, btc_amt = grid_has_buy[level_idx]
                    sell_price = level_price * (1 - FEE_PCT)
                    profit = (sell_price - buy_price) * btc_amt
                    realized_profit += profit
                    cash += sell_price * btc_amt
                    btc_held -= btc_amt
                    total_sells += 1
                    cycle_profits.append(profit)
                    del grid_has_buy[level_idx]
            else:
                # No open buy — check if price crossed DOWN through this level to buy
                if day_low <= level_price and prev_close > level_price:
                    if cash >= capital_per_grid and capital_per_grid > 0:
                        buy_price = level_price * (1 + FEE_PCT)
                        btc_amount = capital_per_grid / buy_price
                        cash -= capital_per_grid
                        btc_held += btc_amount
                        total_buys += 1
                        grid_has_buy[level_idx] = (buy_price, btc_amount)

        # Track equity (cash + unrealized BTC value)
        unrealized = btc_held * close[i]
        equity = cash + unrealized
        equity_values.append(equity)
        equity_dates.append(timestamps[i])

        # Monthly tracking
        month_key = timestamps[i].strftime("%Y-%m")
        monthly_equity[month_key] = equity

    # Final unrealized value
    final_btc_value = btc_held * close[-1]
    final_equity = cash + final_btc_value

    return {
        "cash": cash,
        "btc_held": btc_held,
        "final_btc_value": final_btc_value,
        "final_equity": final_equity,
        "realized_profit": realized_profit,
        "total_buys": total_buys,
        "total_sells": total_sells,
        "cycle_profits": cycle_profits,
        "equity_series": pd.Series(equity_values, index=equity_dates),
        "monthly_equity": monthly_equity,
        "grid_levels_final": grid_levels,
    }


# ── Results Formatting ─────────────────────────────────────────

def print_results(result, df):
    """Print formatted backtest results."""
    total_return = ((result["final_equity"] / INITIAL_CAPITAL) - 1) * 100
    bnh_return = ((df["close"].iloc[-1] / df["close"].iloc[RANGE_LOOKBACK]) - 1) * 100

    # Max drawdown from equity series
    eq = result["equity_series"]
    running_max = eq.cummax()
    drawdown = (eq - running_max) / running_max
    max_dd = abs(drawdown.min()) * 100

    # Monthly returns
    monthly = result["monthly_equity"]
    months = sorted(monthly.keys())
    if len(months) > 1:
        monthly_returns = []
        for i in range(1, len(months)):
            prev_val = monthly[months[i - 1]]
            curr_val = monthly[months[i]]
            if prev_val > 0:
                monthly_returns.append(((curr_val / prev_val) - 1) * 100)
        avg_monthly = np.mean(monthly_returns) if monthly_returns else 0
    else:
        avg_monthly = 0

    # Profit factor (after fees — fees already deducted in simulation)
    profits = [p for p in result["cycle_profits"] if p > 0]
    losses = [abs(p) for p in result["cycle_profits"] if p < 0]
    total_profit = sum(profits) if profits else 0
    total_loss = sum(losses) if losses else 0.001  # avoid div-by-zero
    profit_factor = total_profit / total_loss if total_loss > 0 else float("inf")

    # Avg profit per completed cycle
    completed_cycles = result["total_sells"]
    avg_cycle_pct = 0
    if completed_cycles > 0 and result["cycle_profits"]:
        avg_cycle_pct = np.mean([
            (p / (INITIAL_CAPITAL / NUM_GRIDS)) * 100
            for p in result["cycle_profits"]
        ])

    period_start = df.index[RANGE_LOOKBACK].date()
    period_end = df.index[-1].date()

    print("\n" + "=" * 55)
    print("  Grid Bot Backtest: BTC/USDT Daily, 2 Years")
    print("=" * 55)
    print(f"  Period:              {period_start} to {period_end}")
    print(f"  Grid levels:         {NUM_GRIDS}")
    print(f"  Recenter interval:   {RECENTER_DAYS} days")
    print(f"  Initial capital:     ${INITIAL_CAPITAL:.0f}")
    print(f"  Final value:         ${result['final_equity']:.2f} (realized + unrealized)")
    print(f"  Total return:        {total_return:+.1f}%")
    print(f"  Buy & hold return:   {bnh_return:+.1f}%  (benchmark)")
    print("-" * 55)
    print(f"  Grid profit (realized): ${result['realized_profit']:.2f}")
    print(f"  Unrealized BTC value:   ${result['final_btc_value']:.2f}")
    print(f"  Total grid fills:    {result['total_buys'] + result['total_sells']} (buy: {result['total_buys']}, sell: {result['total_sells']})")
    print(f"  Avg profit per cycle: {avg_cycle_pct:+.2f}%")
    print(f"  Max drawdown:        {max_dd:.1f}%")
    print(f"  Monthly return avg:  {avg_monthly:+.2f}%")
    print(f"  Profit factor:       {profit_factor:.2f}")

    if profit_factor < 1.3:
        print("  *** WARNING: Profit factor below 1.3 fee threshold ***")

    print("=" * 55)


# ── Plotting ───────────────────────────────────────────────────

def plot_grid_equity(result, df, output_path):
    """Save equity curve with BTC price and grid level overlay."""
    eq = result["equity_series"]
    grid_levels = result["grid_levels_final"]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 9), sharex=True,
                                     gridspec_kw={"height_ratios": [2, 1.2]})
    fig.suptitle("Grid Bot — BTC/USDT Daily (Adaptive, 15 Levels)", fontsize=14, fontweight="bold")

    # Equity curve
    ax1.plot(eq.index, eq.values, color="#2563eb", linewidth=1.3, label="Grid Bot Equity")
    # Buy & hold normalized
    start_idx = df.index.get_indexer([eq.index[0]], method="nearest")[0]
    bnh = INITIAL_CAPITAL * (df["close"].iloc[start_idx:] / df["close"].iloc[start_idx])
    ax1.plot(bnh.index, bnh.values, color="#9ca3af", linewidth=0.8, alpha=0.7, label="Buy & Hold")
    ax1.set_ylabel("Portfolio Value ($)")
    ax1.legend(loc="upper left")
    ax1.grid(True, alpha=0.3)

    # BTC price with grid lines
    price_slice = df.iloc[RANGE_LOOKBACK:]
    ax2.plot(price_slice.index, price_slice["close"], color="#f59e0b", linewidth=0.9, label="BTC/USDT")
    # Draw final grid levels as thin horizontal lines
    for level in grid_levels:
        ax2.axhline(y=level, color="#3b82f6", linewidth=0.3, alpha=0.4)
    ax2.set_ylabel("BTC/USDT")
    ax2.set_xlabel("Date")
    ax2.legend(loc="upper left")
    ax2.grid(True, alpha=0.3)

    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"\nChart saved to {output_path}")


# ── Main ───────────────────────────────────────────────────────

def main():
    print("Grid Bot Backtest — BTC/USDT Daily")
    print(f"Lookback: {LOOKBACK_DAYS} days | Capital: ${INITIAL_CAPITAL} | Grids: {NUM_GRIDS} | Fees: {FEE_PCT*100:.1f}%/side\n")

    # 1. Fetch data
    df = fetch_daily_ohlcv()
    print(f"Data: {len(df)} candles, {df.index[0].date()} to {df.index[-1].date()}\n")

    if len(df) < RANGE_LOOKBACK + 30:
        print(f"ERROR: Need at least {RANGE_LOOKBACK + 30} daily candles, got {len(df)}")
        sys.exit(1)

    # 2. Run backtest
    print("Running grid simulation...")
    result = run_grid_backtest(df)

    # 3. Print results
    print_results(result, df)

    # 4. Plot
    chart_path = OUTPUT_DIR / "grid_bot_equity.png"
    plot_grid_equity(result, df, chart_path)

    print("\nDone. Files:")
    print(f"  Data:  {CSV_PATH}")
    print(f"  Chart: {chart_path}")


if __name__ == "__main__":
    main()
