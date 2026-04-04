import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getStatus,
  getMemoryStats,
  getMemoryInsights,
  getMemoryQuality,
  searchMemories,
  getCalendarToday,
  type MemoryStats,
  type Insight,
  type Memory,
  type MemoryQuality,
  type CalendarEvent,
} from "../api";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ReflectionPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [quality, setQuality] = useState<MemoryQuality | null>(null);
  const [decisions, setDecisions] = useState<Memory[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [ownerName, setOwnerName] = useState("User");
  const [quickInput, setQuickInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      getStatus().then((s) => setOwnerName(s.ownerName || "User")),
      getMemoryStats().then(setStats),
      getMemoryInsights().then((r) => setInsights(r.insights)),
      getMemoryQuality().then(setQuality),
      searchMemories("decision", 5).then((r) => setDecisions(r.memories)),
      getCalendarToday().then((r) => setEvents(r.events)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickInput.trim()) {
      navigate(`/chat?message=${encodeURIComponent(quickInput.trim())}`);
    }
  };

  // Pick the most interesting insight for the hero card
  const heroInsight = insights.find((i) => i.type === "trend" || i.type === "stalled") || insights[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-light text-stone-200">
          {getGreeting()}, <span className="font-medium">{ownerName}</span>.
        </h1>
      </div>

      {/* Insight Card */}
      {heroInsight && (
        <div className="relative rounded-xl border border-amber-500/30 bg-stone-900/80 p-6 shadow-[0_0_20px_rgba(217,119,6,0.08)]">
          <div className="flex items-start gap-3">
            <div className="mt-1 text-amber-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-stone-300 text-sm leading-relaxed">{heroInsight.text}</p>
          </div>
        </div>
      )}

      {/* Stats + Decisions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* This Week */}
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">This Week</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-semibold text-stone-200">{stats?.recentCount ?? 0}</p>
              <p className="text-xs text-stone-500 mt-1">memories</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-stone-200">
                {quality?.tagTrends?.filter((t) => t.recent > t.previous).length ?? 0}
              </p>
              <p className="text-xs text-stone-500 mt-1">trends</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-stone-200">{stats?.totalMemories ?? 0}</p>
              <p className="text-xs text-stone-500 mt-1">total</p>
            </div>
          </div>
        </div>

        {/* Recent Decisions */}
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">Recent Decisions</h2>
          {decisions.length > 0 ? (
            <ul className="space-y-3">
              {decisions.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-stone-300 line-clamp-1">{d.content}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{timeAgo(d.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">No recent decisions found.</p>
          )}
        </div>
      </div>

      {/* Today's Calendar */}
      {events.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">Today</h2>
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm">
                <span className="text-amber-400 font-mono text-xs w-24 shrink-0">
                  {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" - "}
                  {new Date(e.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-stone-300">{e.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns */}
      {insights.length > 1 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">Patterns</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.slice(0, 4).map((insight, i) => (
              <div
                key={i}
                className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4 hover:border-amber-500/20 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      insight.type === "trend"
                        ? "bg-blue-400"
                        : insight.type === "stalled"
                          ? "bg-amber-400"
                          : insight.type === "neglected"
                            ? "bg-red-400"
                            : "bg-emerald-400"
                    }`}
                  />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">{insight.type}</p>
                    <p className="text-sm text-stone-300 leading-relaxed">{insight.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Tags */}
      {stats?.topTags && stats.topTags.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">Knowledge Areas</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.slice(0, 10).map((t) => (
              <span
                key={t.tag}
                className="px-3 py-1.5 text-xs rounded-full bg-stone-800/80 text-stone-400 border border-stone-700/50"
              >
                {t.tag} <span className="text-stone-500 ml-1">{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick Input */}
      <form onSubmit={handleQuickSubmit} className="relative">
        <input
          type="text"
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full bg-stone-900/50 border border-stone-800/60 rounded-xl px-5 py-4 text-sm text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_15px_rgba(217,119,6,0.06)] transition-all"
        />
        {quickInput.trim() && (
          <button
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-amber-500 hover:text-amber-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
