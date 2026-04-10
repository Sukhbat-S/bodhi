#!/usr/bin/env python3
"""
Parameter Sweep Tool — Grid Bot & DCA Strategies
=================================================
Runs multiple strategy parameter combinations on cached BTC/USDT daily data
and outputs a ranked results table.

Run: python3 packages/trading/backtest/sweep.py
"""

import csv
import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# ── Paths ────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"
OUTPUT_DIR = SCRIPT_DIR / "output"
CSV_PATH = DATA_DIR / "btc_usdt_daily.csv"
RESULTS_PATH = OUTPUT_DIR / "sweep_results.csv"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ───────────────────────────────────────────────────────
INITIAL_CAPITAL = 100.0
FEE_PCT = 0.001        # 0.1% per side
MA_PERIOD = 200         # For DCA signal
RANGE_LOOKBACK = 90     # Grid bot range lookback

# Parameter grids
GRID_LEVELS = [10, 15, 20, 30]
GRID_RECENTER = [15, 30, 60]       # days
GRID_BUFFER = [0.05, 0.10, 0.15]   # 5%, 10%, 15%

DCA_AMOUNT = [5, 10, 20]           # $ per buy
DCA_UNDERVALUE = [0.7, 0.8, 0.9, 1.0]   # MA ratio threshold
DCA_OVERVALUE = [1.2, 1.4, 1.6]         # MA ratio skip threshold


# ── Data Loading ─────────────────────────────────────────────────

def load_data():
    """Load cached BTC/USDT daily data. No re-fetching."""
    if not CSV_PATH.exists():
        print(f"ERROR: No cached data at {CSV_PATH}")
        print("Run grid_bot_btc.py or dca_onchain_btc.py first to fetch data.")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH, parse_dates=["timestamp"], index_col="timestamp")
    print(f"Loaded {len(df)} daily candles ({df.index[0].date()} to {df.index[-1].date()})")
    return df


# ── Grid Bot Simulation ─────────────────────────────────────────

def compute_grid_levels(high, low, n_levels):
    """Create evenly-spaced grid levels between low and high."""
    return np.linspace(low, high, n_levels + 2)[1:-1]


def compute_range(df_slice, buffer):
    """Rolling high/low with buffer for grid range."""
    high = df_slice["high"].max()
    low = df_slice["low"].min()
    spread = high - low
    return low - spread * buffer, high + spread * buffer


def run_grid(df, num_grids, recenter_days, range_buffer):
    """
    Simplified grid bot simulation.
    Returns dict with total_return, max_drawdown, profit_factor, sharpe.
    """
    close = df["close"].values
    highs = df["high"].values
    lows = df["low"].values
    n = len(close)

    if n < RANGE_LOOKBACK + 30:
        return None

    cash = INITIAL_CAPITAL
    btc_held = 0.0
    capital_per_grid = INITIAL_CAPITAL / num_grids
    cycle_profits = []
    grid_levels = np.array([])
    grid_has_buy = {}
    last_recenter = 0
    equity_values = []

    for i in range(RANGE_LOOKBACK, n):
        # Re-center grid
        if i == RANGE_LOOKBACK or (i - last_recenter) >= recenter_days:
            start = max(0, i - RANGE_LOOKBACK)
            window = df.iloc[start:i + 1]
            range_low, range_high = compute_range(window, range_buffer)

            # Close positions on levels that no longer exist
            new_grid_has_buy = {}
            old_levels = grid_levels.copy() if len(grid_levels) > 0 else np.array([])
            grid_levels = compute_grid_levels(range_high, range_low, num_grids)

            for old_idx, (buy_price, btc_amt) in grid_has_buy.items():
                if len(grid_levels) > 0 and old_idx < len(old_levels):
                    old_price = old_levels[old_idx]
                    dists = np.abs(grid_levels - old_price)
                    nearest = np.argmin(dists)
                    if dists[nearest] / old_price < 0.005 and nearest not in new_grid_has_buy:
                        new_grid_has_buy[nearest] = (buy_price, btc_amt)
                    else:
                        sell_price = close[i] * (1 - FEE_PCT)
                        profit = (sell_price - buy_price) * btc_amt
                        cycle_profits.append(profit)
                        cash += sell_price * btc_amt
                        btc_held -= btc_amt

            grid_has_buy = new_grid_has_buy
            last_recenter = i
            capital_per_grid = max(cash / num_grids, 0.0)

        # Process today's candle
        day_low = lows[i]
        day_high = highs[i]
        prev_close = close[i - 1] if i > 0 else close[i]

        for level_idx, level_price in enumerate(grid_levels):
            if level_idx in grid_has_buy:
                if day_high >= level_price and prev_close < level_price:
                    buy_price, btc_amt = grid_has_buy[level_idx]
                    sell_price = level_price * (1 - FEE_PCT)
                    profit = (sell_price - buy_price) * btc_amt
                    cycle_profits.append(profit)
                    cash += sell_price * btc_amt
                    btc_held -= btc_amt
                    del grid_has_buy[level_idx]
            else:
                if day_low <= level_price and prev_close > level_price:
                    if cash >= capital_per_grid and capital_per_grid > 0:
                        buy_price = level_price * (1 + FEE_PCT)
                        btc_amount = capital_per_grid / buy_price
                        cash -= capital_per_grid
                        btc_held += btc_amount
                        grid_has_buy[level_idx] = (buy_price, btc_amount)

        equity = cash + btc_held * close[i]
        equity_values.append(equity)

    if not equity_values:
        return None

    return _compute_metrics(equity_values, cycle_profits, close, RANGE_LOOKBACK)


# ── DCA Simulation ───────────────────────────────────────────────

def run_dca(df, buy_amount, undervalue_threshold, overvalue_threshold):
    """
    Signal-enhanced DCA simulation.
    Buys on Mondays. Doubles when MA ratio < undervalue_threshold,
    skips when > overvalue_threshold.
    Returns dict with total_return, max_drawdown, profit_factor, sharpe.
    """
    # Compute MA200
    df_work = df.copy()
    df_work["ma200"] = df_work["close"].rolling(window=MA_PERIOD, min_periods=MA_PERIOD).mean()
    df_work["ma_ratio"] = df_work["close"] / df_work["ma200"]
    df_work = df_work.dropna(subset=["ma200"])

    if len(df_work) < 60:
        return None

    total_btc = 0.0
    total_invested = 0.0
    buy_prices = []   # (price, amount) tuples for profit factor
    portfolio_values = []

    for ts, row in df_work.iterrows():
        if ts.weekday() == 0:  # Monday
            ratio = row["ma_ratio"]
            price = row["close"]

            if ratio > overvalue_threshold:
                # Skip
                pass
            elif ratio < undervalue_threshold:
                # Double
                amount = buy_amount * 2
                fee = amount * FEE_PCT
                btc_bought = (amount - fee) / price
                total_btc += btc_bought
                total_invested += amount
                buy_prices.append((price, btc_bought))
            else:
                # Normal
                amount = buy_amount
                fee = amount * FEE_PCT
                btc_bought = (amount - fee) / price
                total_btc += btc_bought
                total_invested += amount
                buy_prices.append((price, btc_bought))

        portfolio_values.append(total_btc * row["close"])

    if not portfolio_values or total_invested == 0:
        return None

    # Compute metrics
    values = np.array(portfolio_values)
    final_value = values[-1]
    total_return = ((final_value / total_invested) - 1) * 100

    # Max drawdown from peak portfolio value
    running_max = np.maximum.accumulate(values)
    mask = values > 0
    if mask.any():
        dd = (values[mask] - running_max[mask]) / running_max[mask]
        max_dd = abs(dd.min()) * 100
    else:
        max_dd = 0.0

    # Profit factor: unrealized gains vs unrealized losses per buy
    current_price = df_work["close"].iloc[-1]
    gains = sum((current_price - p) * amt for p, amt in buy_prices if current_price > p)
    losses = sum((p - current_price) * amt for p, amt in buy_prices if current_price <= p)
    profit_factor = gains / losses if losses > 0 else float("inf")

    # Sharpe ratio (annualized from weekly returns)
    # Filter out zero-value entries (before first buy) to avoid div-by-zero
    nonzero = values[values > 0]
    weekly_values = nonzero[::5]  # approximate weekly sampling
    if len(weekly_values) > 2:
        with np.errstate(divide="ignore", invalid="ignore"):
            weekly_returns = np.diff(weekly_values) / weekly_values[:-1]
        weekly_returns = weekly_returns[np.isfinite(weekly_returns)]
        if len(weekly_returns) > 1 and np.std(weekly_returns) > 0:
            sharpe = (np.mean(weekly_returns) / np.std(weekly_returns)) * np.sqrt(52)
        else:
            sharpe = 0.0
    else:
        sharpe = 0.0

    return {
        "total_return": round(total_return, 2),
        "max_drawdown": round(max_dd, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else 99.99,
        "sharpe": round(sharpe, 2),
    }


# ── Shared Metrics ───────────────────────────────────────────────

def _compute_metrics(equity_values, cycle_profits, close, start_idx):
    """Compute return, drawdown, profit factor, Sharpe from equity series."""
    eq = np.array(equity_values)
    final_equity = eq[-1]
    total_return = ((final_equity / INITIAL_CAPITAL) - 1) * 100

    # Buy & hold
    bnh_return = ((close[-1] / close[start_idx]) - 1) * 100

    # Max drawdown
    running_max = np.maximum.accumulate(eq)
    drawdown = (eq - running_max) / running_max
    max_dd = abs(drawdown.min()) * 100

    # Profit factor
    profits = sum(p for p in cycle_profits if p > 0)
    losses = sum(abs(p) for p in cycle_profits if p < 0)
    profit_factor = profits / losses if losses > 0 else (99.99 if profits > 0 else 0.0)

    # Sharpe (annualized from daily returns)
    if len(eq) > 2:
        daily_returns = np.diff(eq) / eq[:-1]
        daily_returns = daily_returns[np.isfinite(daily_returns)]
        if len(daily_returns) > 1 and np.std(daily_returns) > 0:
            sharpe = (np.mean(daily_returns) / np.std(daily_returns)) * np.sqrt(365)
        else:
            sharpe = 0.0
    else:
        sharpe = 0.0

    return {
        "total_return": round(total_return, 2),
        "max_drawdown": round(max_dd, 2),
        "profit_factor": round(profit_factor, 2),
        "sharpe": round(sharpe, 2),
        "bnh_return": round(bnh_return, 2),
    }


# ── Sweep Runner ─────────────────────────────────────────────────

def sweep_grid(df):
    """Run all grid bot parameter combinations."""
    combos = list(itertools.product(GRID_LEVELS, GRID_RECENTER, GRID_BUFFER))
    total = len(combos)
    results = []

    print(f"\n=== Parameter Sweep: Grid Bot ({total} combos) ===\n")

    for idx, (levels, recenter, buffer) in enumerate(combos, 1):
        print(f"  Running combo {idx}/{total}... (levels={levels}, recenter={recenter}d, buffer={buffer*100:.0f}%)", end="\r")
        metrics = run_grid(df, levels, recenter, buffer)
        if metrics:
            results.append({
                "strategy": "grid",
                "levels": levels,
                "recenter": recenter,
                "buffer": buffer,
                "return": metrics["total_return"],
                "max_dd": metrics["max_drawdown"],
                "pf": metrics["profit_factor"],
                "sharpe": metrics["sharpe"],
                "bnh_return": metrics.get("bnh_return", 0),
            })

    print(f"  Completed {total} grid combos.                                      ")
    return sorted(results, key=lambda r: r["return"], reverse=True)


def sweep_dca(df):
    """Run all DCA parameter combinations."""
    combos = list(itertools.product(DCA_AMOUNT, DCA_UNDERVALUE, DCA_OVERVALUE))
    total = len(combos)
    results = []

    print(f"\n=== Parameter Sweep: DCA ({total} combos) ===\n")

    for idx, (amount, underval, overval) in enumerate(combos, 1):
        print(f"  Running combo {idx}/{total}... (amount=${amount}, underval={underval}, overval={overval})", end="\r")
        metrics = run_dca(df, amount, underval, overval)
        if metrics:
            results.append({
                "strategy": "dca",
                "amount": amount,
                "underval": underval,
                "overval": overval,
                "return": metrics["total_return"],
                "max_dd": metrics["max_drawdown"],
                "pf": metrics["profit_factor"],
                "sharpe": metrics["sharpe"],
            })

    print(f"  Completed {total} DCA combos.                                       ")
    return sorted(results, key=lambda r: r["return"], reverse=True)


# ── Display ──────────────────────────────────────────────────────

def print_grid_table(results, bnh_return):
    """Print ranked grid bot results."""
    print(f"\n{'='*80}")
    print(f"  Parameter Sweep: Grid Bot ({len(results)} combos)")
    print(f"{'='*80}")
    print(f"  {'Rank':>4s}  {'Levels':>6s}  {'Recenter':>8s}  {'Buffer':>6s}  {'Return':>8s}  {'MaxDD':>8s}  {'PF':>6s}  {'Sharpe':>6s}  {'Note':s}")
    print(f"  {'-'*4:s}  {'-'*6:s}  {'-'*8:s}  {'-'*6:s}  {'-'*8:s}  {'-'*8:s}  {'-'*6:s}  {'-'*6:s}  {'-'*16:s}")

    for rank, r in enumerate(results, 1):
        note = ""
        if r["return"] > bnh_return:
            note = "BEATS B&H"
        elif r["pf"] < 1.3:
            note = "BELOW FEE THRESHOLD"

        print(
            f"  {rank:4d}  {r['levels']:6d}  {r['recenter']:6d}d  {r['buffer']*100:5.0f}%  "
            f"{r['return']:+7.1f}%  {-r['max_dd']:+7.1f}%  {r['pf']:5.2f}  {r['sharpe']:+5.2f}  {note}"
        )

    print(f"\n  Buy & Hold return: {bnh_return:+.1f}%")
    beats = sum(1 for r in results if r["return"] > bnh_return)
    if beats > 0:
        print(f"  {beats}/{len(results)} combos beat buy & hold")
    else:
        print(f"  No combo beats buy & hold (expected for grid in trending markets)")

    below_fee = sum(1 for r in results if r["pf"] < 1.3)
    if below_fee > 0:
        print(f"  {below_fee}/{len(results)} combos have profit factor < 1.3 (below fee threshold)")


def print_dca_table(results):
    """Print ranked DCA results."""
    print(f"\n{'='*80}")
    print(f"  Parameter Sweep: Signal-Enhanced DCA ({len(results)} combos)")
    print(f"{'='*80}")
    print(f"  {'Rank':>4s}  {'Amount':>6s}  {'UnderVal':>8s}  {'OverVal':>7s}  {'Return':>8s}  {'MaxDD':>8s}  {'PF':>6s}  {'Sharpe':>6s}  {'Note':s}")
    print(f"  {'-'*4:s}  {'-'*6:s}  {'-'*8:s}  {'-'*7:s}  {'-'*8:s}  {'-'*8:s}  {'-'*6:s}  {'-'*6:s}  {'-'*16:s}")

    for rank, r in enumerate(results, 1):
        note = ""
        if r["pf"] < 1.3:
            note = "BELOW FEE THRESHOLD"

        print(
            f"  {rank:4d}  ${r['amount']:5d}  {r['underval']:8.1f}  {r['overval']:7.1f}  "
            f"{r['return']:+7.1f}%  {-r['max_dd']:+7.1f}%  {r['pf']:5.2f}  {r['sharpe']:+5.2f}  {note}"
        )

    below_fee = sum(1 for r in results if r["pf"] < 1.3)
    if below_fee > 0:
        print(f"\n  {below_fee}/{len(results)} combos have profit factor < 1.3 (below fee threshold)")


# ── CSV Export ───────────────────────────────────────────────────

def export_csv(grid_results, dca_results):
    """Save all results to CSV."""
    rows = []

    for rank, r in enumerate(grid_results, 1):
        rows.append({
            "strategy": "grid",
            "rank": rank,
            "param1_name": "levels",
            "param1_value": r["levels"],
            "param2_name": "recenter_days",
            "param2_value": r["recenter"],
            "param3_name": "buffer_pct",
            "param3_value": r["buffer"] * 100,
            "total_return_pct": r["return"],
            "max_drawdown_pct": r["max_dd"],
            "profit_factor": r["pf"],
            "sharpe_ratio": r["sharpe"],
        })

    for rank, r in enumerate(dca_results, 1):
        rows.append({
            "strategy": "dca",
            "rank": rank,
            "param1_name": "buy_amount",
            "param1_value": r["amount"],
            "param2_name": "undervalue_threshold",
            "param2_value": r["underval"],
            "param3_name": "overvalue_threshold",
            "param3_value": r["overval"],
            "total_return_pct": r["return"],
            "max_drawdown_pct": r["max_dd"],
            "profit_factor": r["pf"],
            "sharpe_ratio": r["sharpe"],
        })

    fieldnames = [
        "strategy", "rank",
        "param1_name", "param1_value",
        "param2_name", "param2_value",
        "param3_name", "param3_value",
        "total_return_pct", "max_drawdown_pct",
        "profit_factor", "sharpe_ratio",
    ]

    with open(RESULTS_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nResults saved to {RESULTS_PATH}")


# ── Main ─────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Parameter Sweep — Grid Bot & DCA Strategies")
    print("  Data: cached BTC/USDT daily candles")
    print("=" * 60)

    # Load data
    df = load_data()

    # Compute buy & hold for grid reference
    start_idx = RANGE_LOOKBACK
    if len(df) > start_idx:
        bnh_return = ((df["close"].iloc[-1] / df["close"].iloc[start_idx]) - 1) * 100
    else:
        bnh_return = 0.0

    # Run sweeps
    grid_results = sweep_grid(df)
    dca_results = sweep_dca(df)

    # Display
    if grid_results:
        print_grid_table(grid_results, bnh_return)
    else:
        print("\nNo grid results (insufficient data?)")

    if dca_results:
        print_dca_table(dca_results)
    else:
        print("\nNo DCA results (insufficient data?)")

    # Export
    export_csv(grid_results, dca_results)

    # Summary
    print(f"\n{'='*60}")
    print(f"  Summary: {len(grid_results)} grid + {len(dca_results)} DCA = {len(grid_results) + len(dca_results)} total combos")
    if grid_results:
        best_grid = grid_results[0]
        print(f"  Best grid: levels={best_grid['levels']}, recenter={best_grid['recenter']}d, buffer={best_grid['buffer']*100:.0f}% → {best_grid['return']:+.1f}%")
    if dca_results:
        best_dca = dca_results[0]
        print(f"  Best DCA:  amount=${best_dca['amount']}, underval={best_dca['underval']}, overval={best_dca['overval']} → {best_dca['return']:+.1f}%")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
