import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getStatus,
  getMemoryStats,
  getMemoryInsights,
  getMemoryQuality,
  getMemories,
  searchMemories,
  getCalendarToday,
  getCalendarFree,
  createMemory,
  getBriefings,
  getGmailInbox,
  getGmailUnread,
  getGitHubActivity,
  getVercelDeployments,
  getNotionTasks,
  getSupabaseHealth,
  getConversations,
  getPendingMemoryCount,
  getActiveSessions,
  getSessionMessages,
  getFileOwnerships,
  subscribeSessionStream,
  type StatusResponse,
  type ActiveSession,
  type SessionMessage,
  type FileOwnership,
  type MemoryStats,
  type Insight,
  type Memory,
  type MemoryQuality,
  type CalendarEvent,
  type FreeSlot,
  type Briefing,
  type EmailSummary,
  type GitHubCommit,
  type GitHubPR,
  type GitHubIssue,
  type VercelDeployment,
  type NotionTask,
  type SupabaseProjectHealth,
  type ConversationThread,
} from "../api";

// ─── Helpers ─────────────────────────────────────────────────

type TimePhase = "morning" | "afternoon" | "evening" | "night";

function getTimePhase(): TimePhase {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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
  return reflectionPrompts[Math.floor(Date.now() / 86400000) % reflectionPrompts.length];
}

function isTodayBriefing(b: Briefing): boolean {
  const d = new Date(b.createdAt);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function getInsightAction(insight: Insight): { label: string; to: string } {
  switch (insight.type) {
    case "stalled": return { label: "Review decisions", to: "/chat?message=" + encodeURIComponent("Help me review my stalled decisions. Which ones still matter?") };
    case "neglected": return { label: "Resurface these", to: "/chat?message=" + encodeURIComponent("What important things have I stored but forgotten about?") };
    case "trend": return { label: "Explore this", to: "/chat?message=" + encodeURIComponent("I've been thinking about this a lot: " + insight.text + " — what patterns do you see?") };
    case "activity": return { label: "Reflect on this", to: "/chat?message=" + encodeURIComponent("My activity changed recently. What might be going on?") };
  }
}

function getContextualGreeting(ownerName: string, phase: TimePhase, unread: number | null, deployState: string | null): { greeting: string; subtext: string } {
  const timeGreeting = phase === "morning" ? "Good morning" : phase === "afternoon" ? "Good afternoon" : phase === "evening" ? "Good evening" : "Good night";
  const greeting = `${timeGreeting}, **${ownerName}**.`;

  const parts: string[] = [];
  if (unread && unread > 0) parts.push(`${unread} unread email${unread > 1 ? "s" : ""}`);
  if (deployState === "BUILDING") parts.push("a deploy is building");
  if (deployState === "ERROR") parts.push("a deploy failed");

  if (parts.length > 0) return { greeting, subtext: `You have ${parts.join(" and ")}.` };
  if (phase === "morning") return { greeting, subtext: "Here's your day." };
  if (phase === "afternoon") return { greeting, subtext: "Build mode." };
  if (phase === "evening") return { greeting, subtext: "Time to reflect." };
  return { greeting, subtext: "Quiet hours." };
}

function deployStateColor(state: string): string {
  switch (state.toUpperCase()) {
    case "READY": return "text-emerald-400";
    case "BUILDING": return "text-amber-400";
    case "ERROR": case "CANCELED": return "text-red-400";
    default: return "text-stone-400";
  }
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton bg-stone-800/40 rounded ${className}`} />;
}

// ─── Collapsible Section ─────────────────────────────────────

function Section({ title, count, defaultOpen = true, children }: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-stone-800/30 transition-colors"
      >
        <span className="text-xs uppercase tracking-wider text-stone-500 flex items-center gap-2">
          {title}
          {count != null && count > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-400 font-medium">{count}</span>
          )}
        </span>
        <svg className={`w-4 h-4 text-stone-600 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function ReflectionPage() {
  const navigate = useNavigate();
  const phase = getTimePhase();
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Core state (existing)
  const [ownerName, setOwnerName] = useState("User");
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [quality, setQuality] = useState<MemoryQuality | null>(null);
  const [decisions, setDecisions] = useState<Memory[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [goals, setGoals] = useState<Memory[]>([]);
  const [latestBriefing, setLatestBriefing] = useState<Briefing | null>(null);

  // New service state
  const [systemStatus, setSystemStatus] = useState<StatusResponse | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [githubData, setGithubData] = useState<{ commits: GitHubCommit[]; prs: GitHubPR[]; issues: GitHubIssue[] } | null>(null);
  const [deployments, setDeployments] = useState<VercelDeployment[]>([]);
  const [tasks, setTasks] = useState<NotionTask[]>([]);
  const [dbHealth, setDbHealth] = useState<SupabaseProjectHealth | null>(null);
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
  const [fileOwnerships, setFileOwnerships] = useState<FileOwnership[]>([]);

  // UI state
  const [quickInput, setQuickInput] = useState("");
  const [quickMode, setQuickMode] = useState<"chat" | "remember">("chat");
  const [remembered, setRemembered] = useState(false);
  const [loading, setLoading] = useState(true);

  // ─── Data Loading (4 tiers) ──────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const s = (fn: () => void) => { if (!cancelled) fn(); };

    // Tier 0 — Instant
    getStatus().then((r) => s(() => { setOwnerName(r.ownerName || "User"); setSystemStatus(r); setLoading(false); })).catch(() => s(() => setLoading(false)));

    // Tier 1 — Critical (50ms)
    const t1 = setTimeout(() => {
      getCalendarToday().then((r) => s(() => setEvents(r.events))).catch(() => {});
      searchMemories("decision", 4).then((r) => s(() => setDecisions(r.memories))).catch(() => {});
      getBriefings({ limit: 1 }).then((r) => s(() => setLatestBriefing(r.briefings[0] || null))).catch(() => {});
      getMemories({ type: "goal", limit: 5 }).then((r) => s(() => setGoals(r.memories))).catch(() => {});
      getMemoryStats().then((r) => s(() => setStats(r))).catch(() => {});
    }, 50);

    // Tier 2 — Important (200ms)
    const t2 = setTimeout(() => {
      getGmailUnread().then((r) => s(() => setUnreadCount(r.unread))).catch(() => s(() => setUnreadCount(0)));
      getGitHubActivity().then((r) => s(() => setGithubData(r))).catch(() => {});
      getVercelDeployments(3).then((r) => s(() => setDeployments(r.deployments))).catch(() => {});
      getNotionTasks("active").then((r) => s(() => setTasks(r.tasks))).catch(() => {});
      getActiveSessions().then((r) => s(() => setActiveSessions(r.sessions))).catch(() => {});
    }, 200);

    // Tier 3 — Background (500ms)
    const t3 = setTimeout(() => {
      getMemoryInsights().then((r) => s(() => setInsights(r.insights))).catch(() => {});
      getMemoryQuality().then((r) => s(() => setQuality(r))).catch(() => {});
      getConversations(3).then((r) => s(() => setConversations(r.threads))).catch(() => {});
      getCalendarFree().then((r) => s(() => setFreeSlots(r.slots))).catch(() => {});
      getGmailInbox(5).then((r) => s(() => setEmails(r.emails))).catch(() => {});
      getPendingMemoryCount().then((r) => s(() => setPendingCount(r.count))).catch(() => s(() => setPendingCount(0)));
      getSupabaseHealth().then((r) => s(() => setDbHealth(r.health))).catch(() => {});
    }, 500);

    return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Real-time session updates via SSE, with polling fallback
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let sseCleanup: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const poll = () => {
      getActiveSessions().then((r) => setActiveSessions(r.sessions)).catch(() => {});
      getSessionMessages().then((r) => setSessionMessages(r.messages)).catch(() => {});
      getFileOwnerships().then((r) => setFileOwnerships(r.files)).catch(() => {});
    };

    const startPolling = () => { if (!pollInterval) { poll(); pollInterval = setInterval(poll, 30_000); } };
    const stopPolling = () => { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } };

    const connectSSE = () => {
      sseCleanup = subscribeSessionStream({
        onInit: ({ sessions, messages, files }) => {
          setActiveSessions(sessions);
          setSessionMessages(messages);
          setFileOwnerships(files);
          stopPolling();
          reconnectDelay = 1000;
        },
        onSessionChange: () => {
          // Re-fetch full session + file state on any change (simple, correct)
          getActiveSessions().then((r) => setActiveSessions(r.sessions)).catch(() => {});
          getFileOwnerships().then((r) => setFileOwnerships(r.files)).catch(() => {});
        },
        onMessageSent: ({ message }) => {
          setSessionMessages((prev) => [...prev, message]);
        },
        onDisconnect: () => {
          startPolling();
          reconnectTimer = setTimeout(() => {
            connectSSE();
            reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
          }, reconnectDelay);
        },
      });
    };

    connectSSE();

    return () => {
      if (sseCleanup) sseCleanup();
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  // Keyboard shortcut: / focuses quick input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        quickInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  // Derived
  const heroInsight = insights.find((i) => i.type === "trend" || i.type === "stalled") || insights[0];
  const latestDeployState = deployments[0]?.state?.toUpperCase() || null;
  const openPRs = githubData?.prs.filter((p) => p.state === "open") || [];
  const { greeting, subtext } = getContextualGreeting(ownerName, phase, unreadCount, latestDeployState);
  const pulseColor = systemStatus
    ? (systemStatus.memory === "active" ? "bg-emerald-400" : "bg-red-400")
    : "bg-stone-600";
  const recentDecisions = decisions.filter((d) => Date.now() - new Date(d.createdAt).getTime() < 7 * 86400000);
  const dayProgress = (() => { const h = new Date().getHours(); const m = new Date().getMinutes(); return Math.min(((h * 60 + m) / (24 * 60)) * 100, 100); })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6 fade-in-up">

          {/* ─── Greeting + Pulse ─── */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-3xl font-light text-stone-200">
                {greeting.split("**").map((part, i) =>
                  i % 2 === 1 ? <span key={i} className="font-medium">{part}</span> : part
                )}
              </h1>
              <p className="text-sm text-stone-500 mt-1">{subtext}</p>
              {/* Day progress */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-0.5 bg-stone-800/60 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500/40 to-amber-500/20 rounded-full transition-all" style={{ width: `${dayProgress}%` }} />
                </div>
                <span className="text-[10px] text-stone-600">{Math.round(dayProgress)}% of day</span>
              </div>
            </div>
            <div className={`w-2.5 h-2.5 rounded-full ${pulseColor} heartbeat`} title="System pulse" />
          </div>

          {/* Nerve center removed — status badges live in sidebar now */}

          {/* ─── Two Column Layout ─── */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">

            {/* ─── LEFT COLUMN (3/5) ─── */}
            <div className="md:col-span-3 space-y-6">

              {/* Hero Zone — time-contextual */}
              <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-stone-900/90 to-stone-900/60 p-6 shadow-[0_0_20px_rgba(217,119,6,0.06)]">
                {phase === "morning" && (
                  <div>
                    <p className="text-xs text-amber-500/70 uppercase tracking-wider mb-3">Morning Briefing</p>
                    {latestBriefing && isTodayBriefing(latestBriefing) ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-1.5 prose-ol:my-1.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {latestBriefing.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-stone-500 mb-2">Briefing generates at 8:00am</p>
                        <p className="text-sm text-stone-400 italic">{getDailyPrompt()}</p>
                      </div>
                    )}
                    {heroInsight && (
                      <div className="mt-4 pt-3 border-t border-stone-800/40">
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">{heroInsight.type}</p>
                        <p className="text-sm text-stone-400 leading-relaxed">{heroInsight.text}</p>
                      </div>
                    )}
                  </div>
                )}

                {phase === "afternoon" && (
                  <div>
                    <p className="text-xs text-amber-500/70 uppercase tracking-wider mb-3">Build Pulse</p>
                    <div className="space-y-3 mb-4">
                      {githubData?.commits[0] && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-stone-600 font-mono text-xs">{githubData.commits[0].sha.slice(0, 7)}</span>
                          <span className="text-stone-300 truncate">{githubData.commits[0].message.split("\n")[0]}</span>
                          <span className="text-[10px] text-stone-500">{timeAgo(githubData.commits[0].date)}</span>
                        </div>
                      )}
                      {deployments[0] && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`text-xs font-medium ${deployStateColor(deployments[0].state)}`}>{deployments[0].state.toUpperCase()}</span>
                          <span className="text-stone-400">{deployments[0].meta?.commitMessage?.split("\n")[0] || deployments[0].name}</span>
                        </div>
                      )}
                      {openPRs.length > 0 && (
                        <p className="text-sm text-stone-400">{openPRs.length} open PR{openPRs.length > 1 ? "s" : ""} waiting for review</p>
                      )}
                      {!githubData && !deployments.length && <Skeleton className="h-8 w-full" />}
                    </div>
                    <button
                      onClick={() => navigate("/chat?message=" + encodeURIComponent("What should I ship next? Check my pending items, open PRs, and current goals."))}
                      className="px-4 py-2 text-sm font-medium text-amber-400 bg-amber-500/10 rounded-lg hover:bg-amber-500/15 transition-colors"
                    >
                      Focus mode &rarr;
                    </button>
                  </div>
                )}

                {phase === "evening" && (
                  <div>
                    <p className="text-xs text-amber-500/70 uppercase tracking-wider mb-3">Reflection</p>
                    {heroInsight && (
                      <div className="mb-4">
                        <p className="text-sm text-stone-300 leading-relaxed">{heroInsight.text}</p>
                        <button
                          onClick={() => navigate(getInsightAction(heroInsight).to)}
                          className="mt-2 text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
                        >
                          {getInsightAction(heroInsight).label} &rarr;
                        </button>
                      </div>
                    )}
                    <div className="border-t border-stone-800/40 pt-4">
                      <p className="text-sm text-stone-400 italic">{getDailyPrompt()}</p>
                      <button
                        onClick={() => { setQuickInput(getDailyPrompt()); quickInputRef.current?.focus(); }}
                        className="mt-2 text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
                      >
                        Think about this &rarr;
                      </button>
                    </div>
                  </div>
                )}

                {phase === "night" && (
                  <div>
                    <p className="text-xs text-amber-500/70 uppercase tracking-wider mb-3">Wind Down</p>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div><p className="text-2xl font-semibold text-stone-200">{stats?.recentCount ?? 0}</p><p className="text-xs text-stone-500 mt-1">this week</p></div>
                      <div><p className="text-2xl font-semibold text-stone-200">{goals.length}</p><p className="text-xs text-stone-500 mt-1">active goals</p></div>
                      <div><p className="text-2xl font-semibold text-stone-200">{stats?.totalMemories ?? 0}</p><p className="text-xs text-stone-500 mt-1">total memories</p></div>
                    </div>
                    <p className="text-sm text-stone-400 italic">{getDailyPrompt()}</p>
                  </div>
                )}
              </div>

              {/* Active Work */}
              <Section title="Active Work" count={activeSessions.length + (tasks.length || 0) + openPRs.length} defaultOpen={true}>
                {/* Session Bridge — Compact Pills */}
                {activeSessions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2">Live Sessions</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {activeSessions.map((s) => {
                        const file = fileOwnerships.find((f) => f.session === s.id);
                        const isRecent = (Date.now() - new Date(s.lastPingAt).getTime()) < 60000;
                        const dotColor = s.project === "bodhi" ? "bg-amber-400" : s.project.includes("jewelry") ? "bg-violet-400" : "bg-emerald-400";
                        return (
                          <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800/50 border border-stone-800/40">
                            <span className="relative flex h-2 w-2 shrink-0">
                              {isRecent && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`} />}
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
                            </span>
                            <span className="text-xs text-stone-200 font-medium">{s.id}</span>
                            <span className="text-[10px] text-stone-500 truncate max-w-32">
                              {file ? file.file.split("/").pop() : s.description}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Message Feed */}
                    {sessionMessages.length > 0 && (
                      <div className="space-y-1">
                        {sessionMessages.slice(-3).map((m) => (
                          <div key={m.id} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-amber-400/60 font-medium">{m.fromSession}</span>
                            <span className="text-stone-700">{m.toSession ? `→ ${m.toSession}` : "•"}</span>
                            <span className="text-stone-500 truncate">{m.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Tasks */}
                {tasks.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2">Tasks</p>
                    <div className="space-y-1.5">
                      {tasks.slice(0, 5).map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                          <span className="text-stone-300 truncate flex-1">{t.title}</span>
                          {t.status && <span className="text-[10px] text-stone-600">{t.status}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Open PRs */}
                {openPRs.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2">Open PRs</p>
                    <div className="space-y-1.5">
                      {openPRs.slice(0, 3).map((pr) => (
                        <div key={pr.number} className="flex items-center gap-2 text-sm">
                          <span className="text-emerald-400 text-xs shrink-0">#{pr.number}</span>
                          <span className="text-stone-300 truncate flex-1">{pr.title}</span>
                          <span className="text-[10px] text-stone-600">{pr.repo.split("/")[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {tasks.length === 0 && openPRs.length === 0 && activeSessions.length === 0 && (
                  <p className="text-sm text-stone-500">All clear.</p>
                )}
              </Section>

              {/* Communications */}
              <Section title="Communications" count={(unreadCount || 0) + conversations.length} defaultOpen={!!unreadCount && unreadCount > 0}>
                {/* Emails */}
                {emails.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-stone-600 uppercase tracking-wider">Email</p>
                      <button onClick={() => navigate("/inbox")} className="text-[10px] text-amber-500/70 hover:text-amber-400">inbox &rarr;</button>
                    </div>
                    <div className="space-y-1.5">
                      {emails.slice(0, 4).map((e) => (
                        <div key={e.id} className="flex items-start gap-2 text-sm">
                          {e.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />}
                          {!e.isUnread && <span className="w-1.5 h-1.5 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className={`truncate ${e.isUnread ? "text-stone-200 font-medium" : "text-stone-400"}`}>{e.subject}</p>
                            <p className="text-[10px] text-stone-600">{e.from.split("<")[0].trim()} &middot; {timeAgo(e.date)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Conversations */}
                {conversations.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-stone-600 uppercase tracking-wider">Recent Conversations</p>
                      <button onClick={() => navigate("/chat")} className="text-[10px] text-amber-500/70 hover:text-amber-400">chat &rarr;</button>
                    </div>
                    <div className="space-y-1.5">
                      {conversations.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => navigate(`/chat`)}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-800/30 rounded-lg p-1 -mx-1 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-600 shrink-0" />
                          <span className="text-stone-400 truncate flex-1">{c.title || "Untitled"}</span>
                          <span className="text-[10px] text-stone-600 shrink-0">{c.channel}</span>
                          <span className="text-[10px] text-stone-600 shrink-0">{timeAgo(c.lastActiveAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {emails.length === 0 && conversations.length === 0 && (
                  <p className="text-sm text-stone-500">All quiet.</p>
                )}
              </Section>

              {/* Build Pipeline */}
              <Section
                title="Build Pipeline"
                count={deployments.length + (githubData?.commits.length || 0)}
                defaultOpen={latestDeployState === "BUILDING" || latestDeployState === "ERROR"}
              >
                {/* Deployments */}
                {deployments.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2">Deployments</p>
                    <div className="space-y-1.5">
                      {deployments.slice(0, 3).map((d) => (
                        <div key={d.id} className="flex items-center gap-3 text-sm">
                          <span className={`text-xs font-medium w-16 ${deployStateColor(d.state)}`}>{d.state.toUpperCase()}</span>
                          <span className="text-stone-400 truncate flex-1">{d.meta?.commitMessage?.split("\n")[0] || d.name}</span>
                          <span className="text-[10px] text-stone-600 shrink-0">{timeAgo(d.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Commits */}
                {githubData?.commits && githubData.commits.length > 0 && (
                  <div>
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2">Recent Commits</p>
                    <div className="space-y-1.5">
                      {githubData.commits.slice(0, 5).map((c) => (
                        <div key={c.sha} className="flex items-center gap-2 text-sm">
                          <span className="text-stone-600 font-mono text-xs shrink-0">{c.sha.slice(0, 7)}</span>
                          <span className="text-stone-400 truncate flex-1">{c.message.split("\n")[0]}</span>
                          <span className="text-[10px] text-stone-600 shrink-0">{timeAgo(c.date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {deployments.length === 0 && !githubData && <Skeleton className="h-12 w-full" />}
              </Section>

              {/* Insights & Patterns */}
              {insights.length > 0 && (
                <Section title="Insights" count={insights.length} defaultOpen={phase === "evening"}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insights.slice(0, 4).map((insight, i) => {
                      const action = getInsightAction(insight);
                      return (
                        <div
                          key={i}
                          onClick={() => navigate(action.to)}
                          className="rounded-lg border border-stone-800/40 bg-stone-800/20 p-3 hover:border-amber-500/20 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                              insight.type === "trend" ? "bg-blue-400" : insight.type === "stalled" ? "bg-amber-400" : insight.type === "neglected" ? "bg-red-400" : "bg-emerald-400"
                            }`} />
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">{insight.type}</p>
                              <p className="text-sm text-stone-300 leading-relaxed line-clamp-2">{insight.text}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>

            {/* ─── RIGHT COLUMN (2/5) ─── */}
            <div className="md:col-span-2 space-y-6">

              {/* Calendar Today */}
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
                <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Today</h2>
                {events.length > 0 ? (
                  <div className="space-y-2">
                    {events.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 text-sm">
                        <span className="text-amber-400 font-mono text-xs w-12 shrink-0">{formatTime(e.start)}</span>
                        <span className="text-stone-300 truncate">{e.summary}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-stone-500">No events today.</p>}
                {freeSlots.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-stone-800/40">
                    <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2">Free Slots</p>
                    <div className="flex flex-wrap gap-2">
                      {freeSlots.slice(0, 3).map((slot, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {formatTime(slot.start)} - {formatTime(slot.end)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Goals */}
              {goals.length > 0 && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                  <h2 className="text-xs uppercase tracking-wider text-cyan-400 mb-3">Goals</h2>
                  <div className="space-y-2">
                    {goals.slice(0, 5).map((g) => (
                      <div key={g.id} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                        <p className="text-sm text-stone-300 leading-relaxed line-clamp-1">{g.content}</p>
                      </div>
                    ))}
                    {goals.length > 5 && <p className="text-xs text-stone-500">+{goals.length - 5} more</p>}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
                <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Build Log", icon: "M13 10V3L4 14h7v7l9-11h-7z", msg: "Generate a build-in-public tweet about what I built this week." },
                    { label: "Draft Post", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", msg: "Help me draft a build-in-public tweet. Make it authentic." },
                    { label: "Pending?", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", msg: "What items are pending from my recent sessions?" },
                    { label: "Briefing", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", msg: "Give me a briefing on what's happening across my projects right now." },
                    { label: "Review", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", msg: "Review my recent code changes and suggest improvements." },
                    { label: "Plan Day", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", msg: "Help me plan the rest of my day based on my calendar and pending work." },
                  ].map((action) => (
                    <button
                      key={action.label}
                      onClick={() => navigate("/chat?message=" + encodeURIComponent(action.msg))}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-stone-800/40 border border-stone-700/30 text-xs text-stone-400 hover:border-amber-500/30 hover:text-stone-200 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-amber-500/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={action.icon} />
                      </svg>
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Latest Briefing — only show if NOT already in hero zone (i.e., not morning or briefing is old) */}
              {latestBriefing && !(phase === "morning" && isTodayBriefing(latestBriefing)) && (
                <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs uppercase tracking-wider text-stone-500">Latest Briefing</h2>
                    <span className="text-[10px] text-stone-600">{latestBriefing.type}</span>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 text-stone-400 line-clamp-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {latestBriefing.content}
                    </ReactMarkdown>
                  </div>
                  <button onClick={() => navigate("/briefings")} className="mt-3 text-xs text-amber-500/70 hover:text-amber-400 transition-colors">
                    All briefings &rarr;
                  </button>
                </div>
              )}

              {/* Knowledge Areas */}
              {stats?.topTags && stats.topTags.length > 0 && (
                <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-5">
                  <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-3">Knowledge</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.topTags.slice(0, 8).map((t) => {
                      const trend = quality?.tagTrends?.find((tt) => tt.tag === t.tag);
                      const arrow = trend ? (trend.recent > trend.previous ? " ↑" : trend.recent < trend.previous ? " ↓" : "") : "";
                      const arrowColor = trend ? (trend.recent > trend.previous ? "text-emerald-400" : "text-red-400") : "";
                      return (
                        <span key={t.tag} className="px-2 py-1 text-[11px] rounded-full bg-stone-800/80 text-stone-400 border border-stone-700/40">
                          {t.tag} <span className="text-stone-500">{t.count}</span>
                          {arrow && <span className={arrowColor}>{arrow}</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Sticky Quick Input ─── */}
      <div className="sticky bottom-0 bg-gradient-to-t from-stone-950 via-stone-950/95 to-transparent pt-6 pb-4 px-6 md:px-8">
        <form onSubmit={handleQuickSubmit} className="max-w-6xl mx-auto">
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
            <span className="text-[10px] text-stone-700 ml-auto">press / to focus</span>
          </div>
          <div className="relative">
            <input
              ref={quickInputRef}
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder={quickMode === "chat" ? "What's on your mind?" : "Write something to remember..."}
              className="w-full bg-stone-900/80 border border-stone-800/60 rounded-xl px-5 py-4 text-sm text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-500/40 focus:shadow-[0_0_15px_rgba(217,119,6,0.06)] transition-all backdrop-blur-sm"
            />
            {quickInput.trim() && (
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-amber-500 hover:text-amber-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
