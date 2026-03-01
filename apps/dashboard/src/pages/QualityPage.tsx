import { useEffect, useState, useCallback } from "react";
import {
  getMemoryInsights,
  getMemoryQuality,
  getMemoryStats,
  patchMemory,
  type Insight,
  type MemoryQuality,
  type MemoryStats,
} from "../api";

const insightColors: Record<string, string> = {
  trend: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  stalled: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  neglected: "bg-red-500/10 text-red-400 border-red-500/20",
  activity: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function QualityPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [quality, setQuality] = useState<MemoryQuality | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ins, q, s] = await Promise.all([
        getMemoryInsights(),
        getMemoryQuality(),
        getMemoryStats(),
      ]);
      setInsights(ins.insights);
      setQuality(q);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quality data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleBoost = async (id: string) => {
    await patchMemory(id, { importanceDelta: 0.1 });
    load();
  };

  const handleArchive = async (id: string) => {
    await patchMemory(id, { confidenceDelta: -10 });
    load();
  };

  if (loading) {
    return (
      <div className="p-8 max-w-5xl">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Memory Quality</h2>
        <p className="text-stone-400">Loading quality data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-5xl">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Memory Quality</h2>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-stone-100 mb-6">Memory Quality</h2>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <p className="text-sm text-stone-400">Total Memories</p>
          <p className="text-3xl font-bold text-stone-100 mt-1">
            {stats?.totalMemories ?? 0}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <p className="text-sm text-stone-400">Created This Week</p>
          <p className="text-3xl font-bold text-stone-100 mt-1">
            {quality?.creationRate.thisWeek ?? 0}
          </p>
          {quality && quality.creationRate.lastWeek > 0 && (
            <p className="text-xs text-stone-500 mt-1">
              vs {quality.creationRate.lastWeek} last week
            </p>
          )}
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <p className="text-sm text-stone-400">Stale</p>
          <p className="text-3xl font-bold text-amber-400 mt-1">
            {quality?.stale.length ?? 0}
          </p>
          <p className="text-xs text-stone-500 mt-1">unaccessed &gt;30d</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <p className="text-sm text-stone-400">Neglected</p>
          <p className="text-3xl font-bold text-red-400 mt-1">
            {quality?.neglected.length ?? 0}
          </p>
          <p className="text-xs text-stone-500 mt-1">high-value, never used</p>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-3">Insights</h3>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`border rounded-lg px-4 py-3 text-sm ${insightColors[ins.type] || "bg-stone-800 text-stone-300 border-stone-700"}`}
              >
                <span className="text-xs font-medium uppercase mr-2 opacity-70">
                  {ins.type}
                </span>
                {ins.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tag Trends */}
      {quality && quality.tagTrends.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-3">Tag Trends</h3>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 space-y-3">
            {quality.tagTrends.slice(0, 10).map((t) => {
              const max = Math.max(t.recent, t.previous, 1);
              return (
                <div key={t.tag} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300">{t.tag}</span>
                    <span className="text-stone-500">
                      {t.recent} this week / {t.previous} last week
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div
                      className="bg-blue-500/60 rounded"
                      style={{ width: `${(t.recent / max) * 100}%` }}
                    />
                    <div
                      className="bg-stone-700 rounded"
                      style={{ width: `${(t.previous / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stale Memories */}
      {quality && quality.stale.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-3">
            Stale Memories{" "}
            <span className="text-stone-500 text-sm font-normal">
              ({quality.stale.length})
            </span>
          </h3>
          <div className="space-y-2">
            {quality.stale.slice(0, 10).map((m) => (
              <div
                key={m.id}
                className="bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-300 line-clamp-2">{m.content}</p>
                  <p className="text-xs text-stone-500 mt-1">
                    imp: {(m.importance * 100).toFixed(0)}% &middot; conf:{" "}
                    {(m.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleBoost(m.id)}
                    className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    Boost
                  </button>
                  <button
                    onClick={() => handleArchive(m.id)}
                    className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neglected High-Value */}
      {quality && quality.neglected.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-3">
            Neglected High-Value{" "}
            <span className="text-stone-500 text-sm font-normal">
              ({quality.neglected.length})
            </span>
          </h3>
          <div className="space-y-2">
            {quality.neglected.slice(0, 10).map((m) => (
              <div
                key={m.id}
                className="bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-300 line-clamp-2">{m.content}</p>
                  <p className="text-xs text-stone-500 mt-1">
                    imp: {(m.importance * 100).toFixed(0)}% &middot;{" "}
                    {new Date(m.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleBoost(m.id)}
                  className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
                >
                  Boost
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequently Accessed */}
      {quality && quality.frequent.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-3">
            Frequently Accessed{" "}
            <span className="text-stone-500 text-sm font-normal">
              ({quality.frequent.length})
            </span>
          </h3>
          <div className="space-y-2">
            {quality.frequent.slice(0, 10).map((m) => (
              <div
                key={m.id}
                className="bg-stone-900 border border-stone-800 rounded-lg px-4 py-3"
              >
                <p className="text-sm text-stone-300 line-clamp-2">{m.content}</p>
                <p className="text-xs text-stone-500 mt-1">
                  imp: {(m.importance * 100).toFixed(0)}% &middot; accessed{" "}
                  {m.accessCount ?? 0}x
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!quality?.stale.length &&
        !quality?.neglected.length &&
        !insights.length &&
        !quality?.tagTrends.length && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
            <p className="text-stone-400">
              Memory health looks good. No stale, neglected, or trending items to
              report.
            </p>
          </div>
        )}
    </div>
  );
}
