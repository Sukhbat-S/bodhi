#!/usr/bin/env python3
"""
RSI+MACD Swing Strategy Backtest — BTC/USDT 4H
================================================
Verifies the claimed 77% win rate from peer-reviewed studies.
Uses Bybit spot data via ccxt, backtested with vectorbt.

Run: python3 packages/trading/backtest/rsi_macd_btc.py
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
CSV_PATH = DATA_DIR / "btc_usdt_4h.csv"

DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ─────────────────────────────────────────────────────
SYMBOL = "BTC/USDT"
TIMEFRAME = "4h"
LOOKBACK_DAYS = 730
INITIAL_CAPITAL = 100.0
FEE_PCT = 0.001       # 0.1% per side
SLIPPAGE_PCT = 0.0005  # 0.05%
TOTAL_COST_PCT = FEE_PCT + SLIPPAGE_PCT  # applied on entry and exit

# RSI / MACD parameters
RSI_PERIOD = 14
RSI_ENTRY = 50
RSI_EXIT = 70
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
CROSSOVER_TOLERANCE = 1  # candles of tolerance for RSI+MACD alignment


# ── Data Fetching ──────────────────────────────────────────────

def fetch_ohlcv():
    """Download BTC/USDT 4h candles from Bybit. Uses CSV cache."""
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
    # 4h candles: ~6 per day * 730 days = ~4380 candles
    expected = LOOKBACK_DAYS * 6
    limit = 1000  # Bybit max per request

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    print(f"Fetching {SYMBOL} {TIMEFRAME} candles from Bybit...")
    while since < now_ms:
        candles = exchange.fetch_ohlcv(SYMBOL, TIMEFRAME, since=since, limit=limit)
        if not candles:
            break
        all_candles.extend(candles)
        new_since = candles[-1][0] + 1  # next ms after last candle
        print(f"  Fetched: {len(all_candles)}/{expected} candles...", end="\r")
        if new_since <= since:
            break  # no progress — avoid infinite loop
        since = new_since
        if len(candles) < 100:
            break  # clearly at the end
        time.sleep(exchange.rateLimit / 1000)  # respect rate limit

    print(f"  Fetched: {len(all_candles)} candles total.          ")

    df = pd.DataFrame(all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df.set_index("timestamp", inplace=True)
    df = df[~df.index.duplicated(keep="last")]
    df.sort_index(inplace=True)

    df.to_csv(CSV_PATH)
    print(f"Saved to {CSV_PATH}")
    return df


# ── Indicator Calculation ──────────────────────────────────────

def compute_rsi(series, period=14):
    """Wilder's RSI."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_macd(series, fast=12, slow=26, signal=9):
    """Standard MACD."""
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line


def crossover(a, b):
    """True where `a` crosses above `b`."""
    return (a > b) & (a.shift(1) <= b.shift(1))


def crossunder(a, b):
    """True where `a` crosses below `b`."""
    return (a < b) & (a.shift(1) >= b.shift(1))


# ── Strategy Signals ───────────────────────────────────────────

def generate_signals(df):
    """
    Entry (long): RSI-14 crosses above 50 AND MACD crosses above signal
                  (same candle or within 1 candle tolerance)
    Exit: RSI-14 crosses above 70 OR MACD crosses below signal
    """
    close = df["close"]
    rsi = compute_rsi(close, RSI_PERIOD)
    macd_line, signal_line = compute_macd(close, MACD_FAST, MACD_SLOW, MACD_SIGNAL)

    # Crossover detection
    rsi_cross_above_50 = crossover(rsi, pd.Series(RSI_ENTRY, index=rsi.index))
    macd_cross_above = crossover(macd_line, signal_line)

    # Entry: both conditions within CROSSOVER_TOLERANCE candles
    # "Within 1 candle" means: condition on this bar OR the previous bar
    rsi_entry_window = rsi_cross_above_50.copy()
    macd_entry_window = macd_cross_above.copy()
    for i in range(1, CROSSOVER_TOLERANCE + 1):
        rsi_entry_window = rsi_entry_window | rsi_cross_above_50.shift(i).astype(bool).fillna(False)
        macd_entry_window = macd_entry_window | macd_cross_above.shift(i).astype(bool).fillna(False)

    entries = rsi_entry_window & macd_entry_window

    # Exit: RSI crosses above 70 OR MACD crosses below signal
    rsi_cross_above_70 = crossover(rsi, pd.Series(RSI_EXIT, index=rsi.index))
    macd_cross_below = crossunder(macd_line, signal_line)
    exits = rsi_cross_above_70 | macd_cross_below

    # Store indicators on df for debugging
    df["rsi"] = rsi
    df["macd"] = macd_line
    df["macd_signal"] = signal_line

    return entries, exits


# ── Backtest Engine ────────────────────────────────────────────

def try_vectorbt_backtest(df, entries, exits):
    """Try vectorbt first — it's fast and gives rich stats."""
    try:
        import vectorbt as vbt

        close = df["close"]
        pf = vbt.Portfolio.from_signals(
            close,
            entries=entries,
            exits=exits,
            init_cash=INITIAL_CAPITAL,
            fees=FEE_PCT + SLIPPAGE_PCT,  # combined cost per side
            freq="4h",
            direction="longonly",
        )
        return pf
    except Exception as e:
        print(f"vectorbt backtest failed ({e}), falling back to pandas...")
        return None


def pandas_backtest(df, entries, exits):
    """Pure pandas fallback — manual trade loop."""
    close = df["close"].values
    timestamps = df.index
    trades = []
    equity = [INITIAL_CAPITAL]
    equity_ts = [timestamps[0]]
    capital = INITIAL_CAPITAL
    in_position = False
    entry_price = 0
    entry_idx = 0

    for i in range(len(close)):
        if not in_position and entries.iloc[i]:
            # Buy
            entry_price = close[i] * (1 + TOTAL_COST_PCT)  # slippage + fee on entry
            in_position = True
            entry_idx = i
        elif in_position and (exits.iloc[i] or i == len(close) - 1):
            # Sell
            exit_price = close[i] * (1 - TOTAL_COST_PCT)  # slippage + fee on exit
            pnl_pct = (exit_price - entry_price) / entry_price
            capital *= (1 + pnl_pct)
            trades.append({
                "entry_time": timestamps[entry_idx],
                "exit_time": timestamps[i],
                "entry_price": entry_price,
                "exit_price": exit_price,
                "pnl_pct": pnl_pct * 100,
                "duration_hours": (i - entry_idx) * 4,
            })
            in_position = False

        equity.append(capital)
        equity_ts.append(timestamps[i])

    return trades, pd.Series(equity, index=equity_ts)


# ── Results Formatting ─────────────────────────────────────────

def print_vectorbt_results(pf, df):
    """Print results from vectorbt Portfolio."""
    stats = pf.stats()
    trades = pf.trades.records_readable if hasattr(pf.trades, "records_readable") else None

    total_return = pf.total_return() * 100
    bnh_return = ((df["close"].iloc[-1] / df["close"].iloc[0]) - 1) * 100

    # Extract trade-level stats
    if trades is not None and len(trades) > 0:
        n_trades = len(trades)
        win_mask = trades["PnL"] > 0
        win_rate = win_mask.mean() * 100
        best = trades["Return"].max() * 100 if "Return" in trades.columns else 0
        worst = trades["Return"].min() * 100 if "Return" in trades.columns else 0
        # Compute duration from entry/exit timestamps
        if "Entry Timestamp" in trades.columns and "Exit Timestamp" in trades.columns:
            durations = pd.to_datetime(trades["Exit Timestamp"]) - pd.to_datetime(trades["Entry Timestamp"])
            avg_dur = durations.mean()
            avg_duration_hrs = avg_dur.total_seconds() / 3600
        elif "Duration" in trades.columns:
            avg_dur = trades["Duration"].mean()
            avg_duration_hrs = avg_dur.total_seconds() / 3600 if hasattr(avg_dur, "total_seconds") else "N/A"
        else:
            avg_duration_hrs = "N/A"
        winning_pnl = trades.loc[win_mask, "PnL"].sum() if win_mask.any() else 0
        losing_pnl = abs(trades.loc[~win_mask, "PnL"].sum()) if (~win_mask).any() else 1
        profit_factor = winning_pnl / losing_pnl if losing_pnl > 0 else float("inf")
    else:
        n_trades = 0
        win_rate = 0
        best = worst = 0
        avg_duration_hrs = "N/A"
        profit_factor = 0

    sharpe = stats.get("Sharpe Ratio", "N/A")
    max_dd = stats.get("Max Drawdown [%]", 0)

    print("\n" + "=" * 55)
    print("  RSI+MACD Strategy Backtest: BTC/USDT 4H")
    print("=" * 55)
    print(f"  Period:            {df.index[0].date()} to {df.index[-1].date()}")
    print(f"  Initial capital:   ${INITIAL_CAPITAL:.0f}")
    print(f"  Fees:              {FEE_PCT*100:.1f}% + {SLIPPAGE_PCT*100:.2f}% slippage per side")
    print("-" * 55)
    print(f"  Total trades:      {n_trades}")
    print(f"  Win rate:          {win_rate:.1f}%")
    print(f"  Total return:      {total_return:+.1f}%")
    print(f"  Buy & hold return: {bnh_return:+.1f}%  (benchmark)")
    print(f"  Sharpe ratio:      {sharpe:.2f}" if isinstance(sharpe, (int, float)) else f"  Sharpe ratio:      {sharpe}")
    print(f"  Max drawdown:      {max_dd:.1f}%")
    print(f"  Avg trade duration:{avg_duration_hrs:.0f} hours" if isinstance(avg_duration_hrs, (int, float)) else f"  Avg trade duration:{avg_duration_hrs}")
    print(f"  Profit factor:     {profit_factor:.2f}")
    print(f"  Best trade:        {best:+.1f}%")
    print(f"  Worst trade:       {worst:+.1f}%")
    print("=" * 55)

    return pf.value()


def print_pandas_results(trades, equity, df):
    """Print results from pandas backtest."""
    bnh_return = ((df["close"].iloc[-1] / df["close"].iloc[0]) - 1) * 100
    total_return = ((equity.iloc[-1] / INITIAL_CAPITAL) - 1) * 100

    n_trades = len(trades)
    if n_trades > 0:
        pnls = [t["pnl_pct"] for t in trades]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]
        win_rate = len(wins) / n_trades * 100
        best = max(pnls)
        worst = min(pnls)
        avg_duration = np.mean([t["duration_hours"] for t in trades])
        winning_sum = sum(wins) if wins else 0
        losing_sum = abs(sum(losses)) if losses else 1
        profit_factor = winning_sum / losing_sum if losing_sum > 0 else float("inf")
    else:
        win_rate = best = worst = avg_duration = profit_factor = 0

    # Sharpe (annualized from 4h returns)
    eq_returns = equity.pct_change().dropna()
    if len(eq_returns) > 1 and eq_returns.std() > 0:
        periods_per_year = 365.25 * 6  # 6 four-hour periods per day
        sharpe = (eq_returns.mean() / eq_returns.std()) * np.sqrt(periods_per_year)
        sharpe_str = f"{sharpe:.2f}"
    else:
        sharpe_str = "N/A"

    # Max drawdown
    running_max = equity.cummax()
    drawdown = (equity - running_max) / running_max
    max_dd = abs(drawdown.min()) * 100

    print("\n" + "=" * 55)
    print("  RSI+MACD Strategy Backtest: BTC/USDT 4H")
    print("  (pandas engine)")
    print("=" * 55)
    print(f"  Period:            {df.index[0].date()} to {df.index[-1].date()}")
    print(f"  Initial capital:   ${INITIAL_CAPITAL:.0f}")
    print(f"  Fees:              {FEE_PCT*100:.1f}% + {SLIPPAGE_PCT*100:.2f}% slippage per side")
    print("-" * 55)
    print(f"  Total trades:      {n_trades}")
    print(f"  Win rate:          {win_rate:.1f}%")
    print(f"  Total return:      {total_return:+.1f}%")
    print(f"  Buy & hold return: {bnh_return:+.1f}%  (benchmark)")
    print(f"  Sharpe ratio:      {sharpe_str}")
    print(f"  Max drawdown:      {max_dd:.1f}%")
    print(f"  Avg trade duration:{avg_duration:.0f} hours" if n_trades > 0 else "  Avg trade duration:N/A")
    print(f"  Profit factor:     {profit_factor:.2f}")
    print(f"  Best trade:        {best:+.1f}%")
    print(f"  Worst trade:       {worst:+.1f}%")
    print("=" * 55)

    return equity


# ── Plotting ───────────────────────────────────────────────────

def plot_equity_curve(equity_series, df, output_path):
    """Save equity curve with BTC price overlay."""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), sharex=True,
                                     gridspec_kw={"height_ratios": [2, 1]})
    fig.suptitle("RSI+MACD Strategy — BTC/USDT 4H", fontsize=14, fontweight="bold")

    # Equity curve
    ax1.plot(equity_series.index, equity_series.values, color="#2563eb", linewidth=1.2, label="Strategy")
    # Normalize buy & hold to same starting capital
    bnh = INITIAL_CAPITAL * (df["close"] / df["close"].iloc[0])
    ax1.plot(bnh.index, bnh.values, color="#9ca3af", linewidth=0.8, alpha=0.7, label="Buy & Hold")
    ax1.set_ylabel("Portfolio Value ($)")
    ax1.legend(loc="upper left")
    ax1.grid(True, alpha=0.3)

    # BTC price
    ax2.plot(df.index, df["close"], color="#f59e0b", linewidth=0.8)
    ax2.set_ylabel("BTC/USDT")
    ax2.set_xlabel("Date")
    ax2.grid(True, alpha=0.3)

    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"\nEquity curve saved to {output_path}")


# ── Main ───────────────────────────────────────────────────────

def main():
    print("RSI+MACD Backtest — BTC/USDT 4H")
    print(f"Lookback: {LOOKBACK_DAYS} days | Capital: ${INITIAL_CAPITAL} | Fees: {(FEE_PCT+SLIPPAGE_PCT)*100:.2f}%/side\n")

    # 1. Fetch data
    df = fetch_ohlcv()
    print(f"Data: {len(df)} candles, {df.index[0].date()} to {df.index[-1].date()}\n")

    # 2. Generate signals
    entries, exits = generate_signals(df)
    n_entries = entries.sum()
    n_exits = exits.sum()
    print(f"Signals: {n_entries} entry triggers, {n_exits} exit triggers")

    # 3. Run backtest (vectorbt first, pandas fallback)
    pf = try_vectorbt_backtest(df, entries, exits)

    if pf is not None:
        equity_series = print_vectorbt_results(pf, df)
    else:
        trades, equity = pandas_backtest(df, entries, exits)
        equity_series = print_pandas_results(trades, equity, df)

    # 4. Plot
    plot_equity_curve(equity_series, df, OUTPUT_DIR / "equity_curve.png")

    print("\nDone. Files:")
    print(f"  Data:  {CSV_PATH}")
    print(f"  Chart: {OUTPUT_DIR / 'equity_curve.png'}")


if __name__ == "__main__":
    main()
