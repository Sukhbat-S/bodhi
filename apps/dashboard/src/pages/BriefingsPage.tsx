import { useEffect, useState } from "react";
import { getBriefings, type Briefing } from "../api";

const TYPE_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  morning: { label: "Morning Briefing", color: "bg-amber-500/10 text-amber-400", icon: "🌅" },
  evening: { label: "Evening Reflection", color: "bg-indigo-500/10 text-indigo-400", icon: "🌆" },
  weekly: { label: "Weekly Synthesis", color: "bg-violet-500/10 text-violet-400", icon: "📊" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const type = filter === "all" ? undefined : (filter as "morning" | "evening" | "weekly");
        const data = await getBriefings({ limit: 50, type });
        setBriefings(data.briefings);
      } catch (err) {
        console.error("Failed to load briefings:", err);
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    load();
  }, [filter]);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Briefings</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-stone-800 text-stone-300 text-sm rounded-lg px-3 py-1.5 border border-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-600"
        >
          <option value="all">All</option>
          <option value="morning">Morning</option>
          <option value="evening">Evening</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-stone-600 border-t-stone-300 rounded-full animate-spin" />
        </div>
      ) : briefings.length === 0 ? (
        <div className="text-center py-20 text-stone-500">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-lg font-medium">No briefings yet</p>
          <p className="text-sm mt-1">
            Briefings appear here after scheduled runs (8am, 6pm, Sunday 8pm)
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {briefings.map((b) => {
            const style = TYPE_STYLES[b.type] || TYPE_STYLES.morning;
            return (
              <article
                key={b.id}
                className="bg-stone-900 border border-stone-800 rounded-xl p-5 transition-colors hover:border-stone-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${style.color}`}
                  >
                    {style.icon} {style.label}
                  </span>
                  <span className="text-xs text-stone-500">{formatDate(b.createdAt)}</span>
                </div>
                <div className="text-stone-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {b.content}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
