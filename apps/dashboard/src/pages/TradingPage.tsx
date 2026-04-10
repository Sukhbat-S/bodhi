import { useEffect, useState } from "react";
import { getTradingStatus, getTradingTrades, type TradingStatusResponse, type Trade } from "../api";

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatUsd(n: number): string {
  const prefix = n >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(n).toFixed(2)}`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    testnet: "bg-amber-500/10 text-amber-400",
    live: "bg-red-500/10 text-red-400",
    "journal-only": "bg-stone-700/50 text-stone-400",
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${colors[mode] || colors["journal-only"]}`}>
      {mode}
    </span>
  );
}

export default function TradingPage() {
  const [status, setStatus] = useState<TradingStatusResponse | null>(null);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([
          getTradingStatus().catch(() => null),
          getTradingTrades(20).catch(() => null),
        ]);
        if (s) setStatus(s);
        if (t) setClosedTrades(t.trades.filter((tr) => tr.status === "closed"));
        if (!s) setError("Could not reach trading API");
        else setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  const stats = status?.stats;
  const openPositions = status?.openPositions || [];
  const hasData = (stats?.totalTrades ?? 0) > 0;

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Trading</h2>
        {status && <ModeBadge mode={status.mode} />}
        {status?.balance && (
          <span className="text-sm text-stone-400 ml-auto">
            Balance: <span className="text-stone-200 font-medium">${status.balance.totalUsd.toFixed(2)}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!hasData && !error && (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-12 text-center">
          <p className="text-stone-400 text-lg mb-2">No trades yet</p>
          <p className="text-stone-500 text-sm">Paper trading starts when testnet is funded.</p>
        </div>
      )}

      {/* Stats row */}
      {hasData && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-sm text-stone-400 mb-1">Total P&L</p>
            <p className={`text-2xl font-bold ${stats.totalPnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatUsd(stats.totalPnlUsd)}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-sm text-stone-400 mb-1">Win Rate</p>
            <p className="text-2xl font-bold text-stone-100">
              {stats.closedTrades > 0 ? formatPercent(stats.winRate) : "--"}
            </p>
            {stats.closedTrades > 0 && (
              <p className="text-xs text-stone-500 mt-1">
                {stats.winners}W / {stats.losers}L
              </p>
            )}
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-sm text-stone-400 mb-1">Avg R-Multiple</p>
            <p className={`text-2xl font-bold ${stats.avgRMultiple >= 0 ? "text-stone-100" : "text-red-400"}`}>
              {stats.closedTrades > 0 ? `${stats.avgRMultiple.toFixed(2)}R` : "--"}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-sm text-stone-400 mb-1">Open Positions</p>
            <p className="text-2xl font-bold text-stone-100">{stats.openTrades}</p>
          </div>
        </div>
      )}

      {/* Open Positions */}
      {openPositions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-3">Open Positions</h3>
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left text-stone-500 font-medium px-4 py-3">Symbol</th>
                  <th className="text-left text-stone-500 font-medium px-4 py-3">Side</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">Entry</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">Stop</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">Size</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">Age</th>
                  <th className="text-left text-stone-500 font-medium px-4 py-3">Thesis</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((t) => (
                  <tr key={t.id} className="border-b border-stone-800/50 hover:bg-stone-800/30">
                    <td className="px-4 py-3 text-stone-200 font-medium">{t.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={t.side === "long" ? "text-emerald-400" : "text-red-400"}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-300 font-mono">{t.entryPrice.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-stone-400 font-mono">{t.stopLoss.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-stone-300">${t.size.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-stone-500">{timeAgo(new Date(t.openedAt))}</td>
                    <td className="px-4 py-3 text-stone-500 truncate max-w-[200px]" title={t.thesis}>{t.thesis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed Trades */}
      {closedTrades.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-stone-100 mb-3">Recent Closed Trades</h3>
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left text-stone-500 font-medium px-4 py-3">Symbol</th>
                  <th className="text-left text-stone-500 font-medium px-4 py-3">Side</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">Entry / Exit</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">P&L</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">R</th>
                  <th className="text-right text-stone-500 font-medium px-4 py-3">Date</th>
                  <th className="text-left text-stone-500 font-medium px-4 py-3">Thesis</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((t) => (
                  <tr key={t.id} className="border-b border-stone-800/50 hover:bg-stone-800/30">
                    <td className="px-4 py-3 text-stone-200 font-medium">{t.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={t.side === "long" ? "text-emerald-400" : "text-red-400"}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-300 font-mono">
                      {t.entryPrice.toLocaleString()} / {t.exitPrice?.toLocaleString() ?? "?"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={(t.pnlUsd ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {t.pnlUsd != null ? formatUsd(t.pnlUsd) : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-400 font-mono">
                      {t.rMultiple != null ? `${t.rMultiple.toFixed(2)}R` : "--"}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-500">
                      {t.closedAt ? new Date(t.closedAt).toLocaleDateString() : "--"}
                    </td>
                    <td className="px-4 py-3 text-stone-500 truncate max-w-[200px]" title={t.thesis}>{t.thesis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
