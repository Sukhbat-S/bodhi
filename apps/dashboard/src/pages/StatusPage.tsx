import { useEffect, useState } from "react";
import { getStatus, getMemoryStats, type StatusResponse, type MemoryStats } from "../api";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusBadge({ value }: { value: string }) {
  const isGood = ["online", "active", "connected", "available", "idle"].includes(value);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
        isGood
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-amber-500/10 text-amber-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isGood ? "bg-emerald-400" : "bg-amber-400"}`} />
      {value}
    </span>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, m] = await Promise.all([getStatus(), getMemoryStats()]);
        setStatus(s);
        setStats(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load status");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-stone-100 mb-6">System Status</h2>

      {/* Service Status Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-stone-400">Agent</h3>
            <StatusBadge value={status?.agent || "unknown"} />
          </div>
          <p className="text-xs text-stone-500">Routes reasoning through Claude Code CLI</p>
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-stone-400">Bridge</h3>
            <StatusBadge value={status?.bridge || "unknown"} />
          </div>
          <p className="text-xs text-stone-500">Claude Code CLI subprocess controller</p>
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-stone-400">Memory</h3>
            <StatusBadge value={status?.memory || "unknown"} />
          </div>
          <p className="text-xs text-stone-500">Voyage AI embeddings + pgvector</p>
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-stone-400">Telegram</h3>
            <StatusBadge value={status?.channels?.telegram || "unknown"} />
          </div>
          <p className="text-xs text-stone-500">Primary chat channel</p>
        </div>
      </div>

      {/* Uptime */}
      {status?.uptime && (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-medium text-stone-400 mb-2">Uptime</h3>
          <p className="text-3xl font-mono text-stone-100">{formatUptime(status.uptime)}</p>
        </div>
      )}

      {/* Memory Stats */}
      {stats && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-stone-100">Memory Stats</h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
              <p className="text-sm text-stone-400 mb-1">Total Memories</p>
              <p className="text-3xl font-bold text-stone-100">{stats.totalMemories}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
              <p className="text-sm text-stone-400 mb-1">Last 24h</p>
              <p className="text-3xl font-bold text-stone-100">{stats.recentCount}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
              <p className="text-sm text-stone-400 mb-1">Top Tags</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {stats.topTags.length === 0 && (
                  <span className="text-xs text-stone-500">No tags yet</span>
                )}
                {stats.topTags.slice(0, 5).map((t) => (
                  <span
                    key={t.tag}
                    className="inline-flex items-center gap-1 text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full"
                  >
                    {t.tag}
                    <span className="text-stone-500">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
