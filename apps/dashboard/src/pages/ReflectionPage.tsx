import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getStatus,
  getMemoryStats,
  getMemoryInsights,
  getMemoryQuality,
  getMemories,
  searchMemories,
  getCalendarToday,
  createMemory,
  getBriefings,
  type MemoryStats,
  type Insight,
  type Memory,
  type MemoryQuality,
  type CalendarEvent,
  type Briefing,
} from "../api";

const reflectionPrompts = [
  "What's one decision from this week you haven't revisited?",
  "What pattern in your work would you like to change?",
  "What did you learn recently that surprised you?",
  "Is there something you've been avoiding thinking about?",
  "What's working well right now that you should do more of?",
  "Who have you been meaning to reach out to?",
  "What would your future self thank you for doing today?",
  "What assumption are you making that might be wrong?",
  "What's the smallest step you can take on your biggest goal?",
  "What did you spend time on this week that didn't matter?",
  "What are you most proud of recently?",
  "What would you do differently if you started this project today?",
  "Is there a commitment you made that no longer serves you?",
  "What skill gap is holding you back the most right now?",
  "What would make tomorrow a great day?",
];

function getDailyPrompt(): string {
  const dayIndex = Math.floor(Date.now() / 86400000) % reflectionPrompts.length;
  return reflectionPrompts[dayIndex];
}

function getContextualGreeting(
  ownerName: string,
  stats: MemoryStats | null,
  insights: Insight[],
  quality: MemoryQuality | null
): { greeting: string; subtext?: string } {
  const hour = new Date().getHours();
  const timeGreeting = hour < 6 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const greeting = `${timeGreeting}, **${ownerName}**.`;

  if (stats && stats.recentCount === 0 && hour < 12) {
    return { greeting, subtext: "Quiet week so far. Ready to capture something?" };
  }
  const stalledInsight = insights.find((i) => i.type === "stalled");
  if (stalledInsight) {
    return { greeting, subtext: "Some decisions are waiting for you." };
  }
  if (quality?.creationRate && quality.creationRate.thisWeek > quality.creationRate.lastWeek * 1.5 && quality.creationRate.thisWeek > 5) {
    return { greeting, subtext: "You've been thinking a lot this week." };
  }
  return { greeting };
}

function getInsightAction(insight: Insight): { label: string; to: string } {
  switch (insight.type) {
    case "stalled":
      return { label: "Review decisions", to: "/chat?message=" + encodeURIComponent("Help me review my stalled decisions. Which ones still matter?") };
    case "neglected":
      return { label: "Resurface these", to: "/chat?message=" + encodeURIComponent("What important things have I stored but forgotten about?") };
    case "trend":
      return { label: "Explore this", to: "/chat?message=" + encodeURIComponent("I've been thinking about this a lot: " + insight.text + " — what patterns do you see?") };
    case "activity":
      return { label: "Reflect on this", to: "/chat?message=" + encodeURIComponent("My activity changed recently. What might be going on?") };
  }
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
  const [latestBriefing, setLatestBriefing] = useState<Briefing | null>(null);
  const [goals, setGoals] = useState<Memory[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [quickMode, setQuickMode] = useState<"chat" | "remember">("chat");
  const [remembered, setRemembered] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      getStatus().then((s) => setOwnerName(s.ownerName || "User")),
      getMemoryStats().then(setStats),
      getMemoryInsights().then((r) => setInsights(r.insights)),
      getMemoryQuality().then(setQuality),
      searchMemories("decision", 5).then((r) => setDecisions(r.memories)),
      getMemories({ type: "goal", limit: 10 }).then((r) => setGoals(r.memories)).catch(() => {}),
      getCalendarToday().then((r) => setEvents(r.events)).catch(() => {}),
      getBriefings({ limit: 1 }).then((r) => setLatestBriefing(r.briefings[0] || null)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    if (quickMode === "chat") {
      navigate(`/chat?message=${encodeURIComponent(quickInput.trim())}`);
    } else {
      await createMemory({ content: quickInput.trim(), importance: 0.7, tags: ["manual"] });
      setQuickInput("");
      setRemembered(true);
      setTimeout(() => setRemembered(false), 2000);
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
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8 fade-in-up">
      {/* Greeting */}
      {(() => {
        const { greeting, subtext } = getContextualGreeting(ownerName, stats, insights, quality);
        return (
          <div>
            <h1 className="text-3xl font-light text-stone-200">
              {greeting.split("**").map((part, i) =>
                i % 2 === 1 ? <span key={i} className="font-medium">{part}</span> : part
              )}
            </h1>
            {subtext && <p className="text-sm text-stone-500 mt-1">{subtext}</p>}
          </div>
        );
      })()}

      {/* Insight Card */}
      {heroInsight && (() => {
        const action = getInsightAction(heroInsight);
        return (
          <div className="relative rounded-xl border border-amber-500/30 bg-stone-900/80 p-6 shadow-[0_0_20px_rgba(217,119,6,0.08)] insight-glow">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-amber-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-stone-300 text-sm leading-relaxed">{heroInsight.text}</p>
                <button
                  onClick={() => navigate(action.to)}
                  className="mt-3 px-4 py-2 text-sm font-medium text-amber-400 bg-amber-500/10 rounded-lg hover:bg-amber-500/15 transition-colors"
                >
                  {action.label} &rarr;
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Daily Reflection Prompt */}
      <div className="rounded-xl border border-stone-800/40 bg-stone-900/30 p-5">
        <p className="text-sm text-stone-400 italic leading-relaxed">{getDailyPrompt()}</p>
        <button
          onClick={() => {
            setQuickInput(getDailyPrompt());
            document.querySelector<HTMLInputElement>('input[placeholder]')?.focus();
          }}
          className="mt-3 text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
        >
          Think about this &rarr;
        </button>
      </div>

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
                <li
                  key={d.id}
                  onClick={() => navigate(`/chat?message=${encodeURIComponent("Let's revisit this decision: \"" + d.content + "\" — is it still the right call?")}`)}
                  className="flex items-start gap-2 cursor-pointer hover:bg-stone-800/30 rounded-lg p-1 -m-1 transition-colors"
                >
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

      {/* Active Goals */}
      {goals.length > 0 && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <h2 className="text-xs uppercase tracking-wider text-cyan-400 mb-4">Your Goals</h2>
          <div className="space-y-3">
            {goals.map((g) => (
              <div key={g.id} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-stone-300 leading-relaxed">{g.content}</p>
                  <p className="text-[11px] text-stone-600 mt-1">{formatAge(g.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {insights.slice(0, 4).map((insight, i) => {
              const action = getInsightAction(insight);
              return (
                <div
                  key={i}
                  onClick={() => navigate(action.to)}
                  className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4 hover:border-amber-500/20 cursor-pointer transition-colors"
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
                    <div className="flex-1">
                      <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">{insight.type}</p>
                      <p className="text-sm text-stone-300 leading-relaxed">{insight.text}</p>
                      <p className="text-xs text-amber-500/70 hover:text-amber-400 mt-2 transition-colors">{action.label} &rarr;</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
        <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => navigate("/chat?message=" + encodeURIComponent("Generate a build-in-public tweet about what I built this week. Use my recent git commits and session memories."))}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-stone-800/50 border border-stone-700/50 text-sm text-stone-300 hover:border-amber-500/30 hover:text-stone-100 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-amber-500/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate Build Log
          </button>
          <button
            onClick={() => navigate("/chat?message=" + encodeURIComponent("Help me draft a build-in-public tweet about what I built recently. Make it authentic and technical."))}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-stone-800/50 border border-stone-700/50 text-sm text-stone-300 hover:border-amber-500/30 hover:text-stone-100 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-amber-500/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Draft X Post
          </button>
          <button
            onClick={() => navigate("/chat?message=" + encodeURIComponent("What items are pending from my recent sessions? What should I work on next?"))}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-stone-800/50 border border-stone-700/50 text-sm text-stone-300 hover:border-amber-500/30 hover:text-stone-100 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-amber-500/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            What's Pending?
          </button>
        </div>
      </div>

      {/* Latest Briefing */}
      {latestBriefing && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Latest Briefing</h2>
          <p className="text-sm text-stone-400 leading-relaxed line-clamp-3 whitespace-pre-line">{latestBriefing.content}</p>
          <button
            onClick={() => navigate("/briefings")}
            className="mt-3 text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
          >
            Read full briefing &rarr;
          </button>
        </div>
      )}

      {/* Top Tags */}
      {stats?.topTags && stats.topTags.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
          <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">Knowledge Areas</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.slice(0, 10).map((t) => {
              const trend = quality?.tagTrends?.find((tt) => tt.tag === t.tag);
              const arrow = trend ? (trend.recent > trend.previous ? "text-emerald-400" : trend.recent < trend.previous ? "text-red-400" : "") : "";
              const arrowChar = trend ? (trend.recent > trend.previous ? " ↑" : trend.recent < trend.previous ? " ↓" : "") : "";
              return (
                <span
                  key={t.tag}
                  className="px-3 py-1.5 text-xs rounded-full bg-stone-800/80 text-stone-400 border border-stone-700/50"
                >
                  {t.tag} <span className="text-stone-500 ml-1">{t.count}</span>
                  {arrowChar && <span className={`ml-0.5 ${arrow}`}>{arrowChar}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Input */}
      <form onSubmit={handleQuickSubmit} className="relative">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setQuickMode("chat")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${quickMode === "chat" ? "bg-amber-500/15 text-amber-400" : "text-stone-500 hover:text-stone-400"}`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setQuickMode("remember")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${quickMode === "remember" ? "bg-amber-500/15 text-amber-400" : "text-stone-500 hover:text-stone-400"}`}
          >
            Remember
          </button>
          {remembered && <span className="text-xs text-emerald-400 ml-2">Remembered</span>}
        </div>
        <input
          type="text"
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder={quickMode === "chat" ? "What's on your mind?" : "Write something to remember..."}
          className="w-full bg-stone-900/50 border border-stone-800/60 rounded-xl px-5 py-4 text-sm text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_15px_rgba(217,119,6,0.06)] transition-all"
        />
        {quickInput.trim() && (
          <button
            type="submit"
            className="absolute right-3 bottom-2 p-2 text-amber-500 hover:text-amber-400 transition-colors"
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
