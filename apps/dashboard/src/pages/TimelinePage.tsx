import { useEffect, useState } from "react";
import { getMemories, type Memory } from "../api";

const typeColors: Record<string, { dot: string; badge: string }> = {
  decision: { dot: "bg-emerald-400", badge: "bg-emerald-500/10 text-emerald-400" },
  pattern: { dot: "bg-violet-400", badge: "bg-violet-500/10 text-violet-400" },
  fact: { dot: "bg-blue-400", badge: "bg-blue-500/10 text-blue-400" },
  event: { dot: "bg-rose-400", badge: "bg-rose-500/10 text-rose-400" },
  preference: { dot: "bg-amber-400", badge: "bg-amber-500/10 text-amber-400" },
};

type TimeRange = "7" | "30" | "all";

function groupByDate(memories: Memory[]): [string, Memory[]][] {
  const groups: Record<string, Memory[]> = {};
  for (const m of memories) {
    const date = new Date(m.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(m);
  }
  return Object.entries(groups);
}

function filterByDays(memories: Memory[], days: number): Memory[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return memories.filter((m) => new Date(m.createdAt).getTime() > cutoff);
}

export default function TimelinePage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("7");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getMemories({ limit: 100 })
      .then((r) => setMemories(r.memories))
      .finally(() => setLoading(false));
  }, []);

  const filtered = range === "all" ? memories : filterByDays(memories, Number(range));
  const grouped = groupByDate(filtered);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-light text-stone-200">Your Timeline</h1>
        <div className="flex gap-1 bg-stone-900 rounded-lg p-1 border border-stone-800/60">
          {([["7", "7 days"], ["30", "30 days"], ["all", "All"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setRange(val)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                range === val
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-stone-500 hover:text-stone-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-stone-500">No memories in this time range.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-stone-800/60" />

          <div className="space-y-8">
            {grouped.map(([date, mems]) => (
              <div key={date}>
                {/* Date marker */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-stone-900 border border-stone-800/60 flex items-center justify-center z-10">
                    <span className="text-xs font-medium text-amber-400">
                      {date.split(" ")[1]?.replace(",", "")}
                    </span>
                  </div>
                  <span className="text-xs text-stone-500 uppercase tracking-wider">{date}</span>
                </div>

                {/* Memories for this date */}
                <div className="ml-[19px] pl-8 border-l border-transparent space-y-3">
                  {mems.map((m) => {
                    const colors = typeColors[m.type] || typeColors.fact;
                    const isExpanded = expandedId === m.id;
                    const isLong = m.content.length > 120;

                    return (
                      <div
                        key={m.id}
                        className="relative group"
                      >
                        {/* Connector dot */}
                        <div className={`absolute -left-[37px] top-3 w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-stone-950`} />

                        <div
                          className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4 hover:border-stone-700/60 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${colors.badge}`}>
                              {m.type}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm text-stone-300 leading-relaxed ${!isExpanded && isLong ? "line-clamp-2" : ""}`}>
                                {m.content}
                              </p>
                              {m.tags && m.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {m.tags.slice(0, 5).map((tag) => (
                                    <span key={tag} className="text-xs text-stone-500 bg-stone-800/50 px-2 py-0.5 rounded-full">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-stone-600 shrink-0">
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
