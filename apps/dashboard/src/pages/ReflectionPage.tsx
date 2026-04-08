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
  dispatchMission,
  cancelMission,
  getMissions,
} from "../api";
import CommandBar from "../components/CommandBar";
import MissionCard, { type Mission, type MissionTask } from "../components/MissionCard";
import SessionCard from "../components/SessionCard";

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

const DAILY_LINES = [
  "Every line of code is a brick in something only you can build.",
  "The best tools are the ones you build for yourself.",
  "Most people consume. You create. That's the difference.",
  "Your 21-year-old self is building what 30-year-olds wish they had.",
  "Two markets, two languages, one builder. Keep stacking.",
  "The compound effect of daily building is invisible until it's not.",
  "Ship small, ship often. Perfection is the enemy of progress.",
  "BODHI remembers so you can focus on what matters.",
  "The gap between idea and execution is just one session.",
  "While others scroll, you build. The asymmetry is your edge.",
  "Great products aren't built in a day — they're built day by day.",
  "Your sister's business runs on code you wrote. That's real impact.",
  "Mongolia to the world. One commit at a time.",
  "The best time to plant a tree was 20 years ago. The second best time is this session.",
  "You're not just writing code. You're writing your story.",
  "Systems beat motivation. BODHI is your system.",
  "The rarest skill isn't coding — it's the taste to know what to build.",
  "Every memory stored is compound interest for your future self.",
  "Build in public, learn in private, ship regardless.",
  "The terminal is your workshop. Open it and make something.",
  "Today's small fix is tomorrow's foundation.",
  "Clarity comes from building, not planning.",
  "You're one good session away from the next breakthrough.",
  "The world needs builders who ship, not dreamers who plan.",
  "Суухаа гэж байхгүй, босоо гэж байна. Keep building.",
  "Fun fact: The average person spends 2 hours daily on social media. You spend it building.",
  "Fun fact: There are ~28M developers worldwide. Fewer than 1% build their own AI companion.",
  "Fun fact: The first line of code was written in 1843 by Ada Lovelace. You're 183 years into the tradition.",
  "Fun fact: Ulaanbaatar is the coldest capital city. Your code runs hot regardless.",
  "Fun fact: The word 'Bodhi' means awakening. Every session is a step toward it.",
];

function getContextualGreeting(ownerName: string, phase: TimePhase, _unread: number | null, deployState: string | null): { greeting: string; subtext: string } {
  const timeGreeting = phase === "morning" ? "Good morning" : phase === "afternoon" ? "Good afternoon" : phase === "evening" ? "Good evening" : "Good night";
  const greeting = `${timeGreeting}, **${ownerName}**.`;

  // Deploy alerts take priority
  if (deployState === "ERROR") return { greeting, subtext: "A deploy failed — check Vercel." };
  if (deployState === "BUILDING") return { greeting, subtext: "A deploy is building..." };

  // Daily rotating inspiration
  const dayIndex = Math.floor(Date.now() / 86400000) % DAILY_LINES.length;
  return { greeting, subtext: DAILY_LINES[dayIndex] };
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
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-300 font-medium">{count}</span>
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

  // ─── Mission State (merged from MissionControlPage) ────
  const [missions, setMissions] = useState<Mission[]>([]);
  const [dispatching, setDispatching] = useState(false);

  const handleDispatch = useCallback(async (goal: string, model: string) => {
    setDispatching(true);
    try {
      const { missionId } = await dispatchMission(goal, model);
      setMissions((prev) => [{ id: missionId, goal, model, status: "dispatching", tasks: [], progress: [], startedAt: new Date().toISOString() }, ...prev]);
    } catch (err) { console.error("Dispatch failed:", err); }
    finally { setDispatching(false); }
  }, []);

  const handleCancel = useCallback(async (id: string) => {
    try { await cancelMission(id); } catch (err) { console.error("Cancel failed:", err); }
  }, []);

  const activeMissions = missions.filter((m) => m.status === "dispatching" || m.status === "running" || m.status === "planning");
  const completedMissions = missions.filter((m) => m.status !== "dispatching" && m.status !== "running" && m.status !== "planning");

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
          getActiveSessions().then((r) => setActiveSessions(r.sessions)).catch(() => {});
          getFileOwnerships().then((r) => setFileOwnerships(r.files)).catch(() => {});
        },
        onMessageSent: ({ message }) => {
          setSessionMessages((prev) => [...prev, message]);
        },
        onMissionUpdate: (data) => {
          const { missionId, type } = data;
          setMissions((prev) => {
            const idx = prev.findIndex((m) => m.id === missionId);
            if (idx < 0) {
              if (type === "mission:dispatched") {
                return [...prev, { id: missionId, goal: (data.goal as string) || "", model: (data.model as string) || "sonnet", status: "dispatching" as const, tasks: [], progress: [], startedAt: new Date().toISOString() }];
              }
              return prev;
            }
            return prev.map((m, i) => {
              if (i !== idx) return m;
              if (type === "mission:planning") return { ...m, status: "planning" as const };
              if (type === "mission:planned") {
                const plan = data.plan as { phases: { tasks: { id: string; title: string }[] }[] };
                return { ...m, tasks: plan.phases.flatMap((p) => p.tasks.map((t) => ({ id: t.id, title: t.title, status: "pending" as const, progress: [] }))) };
              }
              if (type === "mission:phase") return { ...m, status: "running" as const, phase: data.phase as string };
              if (type === "task:running") return { ...m, tasks: m.tasks.map((t) => t.id === data.taskId ? { ...t, status: "running" as const } : t) };
              if (type === "task:progress") return { ...m, tasks: m.tasks.map((t) => t.id === data.taskId ? { ...t, progress: [...t.progress, data.chunk as string] } : t) };
              if (type === "task:completed") return { ...m, tasks: m.tasks.map((t) => t.id === data.taskId ? { ...t, status: "completed" as const, result: data.result as string } : t) };
              if (type === "task:failed") return { ...m, tasks: m.tasks.map((t) => t.id === data.taskId ? { ...t, status: "failed" as const, error: data.error as string } : t) };
              if (type === "mission:progress") return { ...m, status: "running" as const, progress: [...m.progress, data.chunk as string] };
              if (type === "mission:completed") return { ...m, status: "completed" as const, result: data.result as string, completedAt: new Date().toISOString() };
              if (type === "mission:failed") return { ...m, status: "failed" as const, error: (data.error as string) || undefined, completedAt: new Date().toISOString() };
              return m;
            });
          });
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
                          className="mt-2 text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
                        >
                          {getInsightAction(heroInsight).label} &rarr;
                        </button>
                      </div>
                    )}
                    <div className="border-t border-stone-800/40 pt-4">
                      <p className="text-sm text-stone-400 italic">{getDailyPrompt()}</p>
                      <button
                        onClick={() => { setQuickInput(getDailyPrompt()); quickInputRef.current?.focus(); }}
                        className="mt-2 text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
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

              {/* === MISSIONS (merged from MissionControlPage) === */}
              <CommandBar onDispatch={handleDispatch} disabled={dispatching} />

              {activeMissions.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Running</h2>
                  {activeMissions.map((m) => (
                    <MissionCard key={m.id} mission={m} onCancel={handleCancel} />
                  ))}
                </div>
              )}

              {activeSessions.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Sessions</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeSessions.map((s) => (
                      <SessionCard key={s.id} session={s} files={fileOwnerships} />
                    ))}
                  </div>
                </div>
              )}

              {completedMissions.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Completed</h2>
                  {completedMissions.map((m) => (
                    <MissionCard key={m.id} mission={m} onCancel={handleCancel} />
                  ))}
                </div>
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
                  </div>
                </div>
              )}

              {/* Latest Briefing — only show if NOT already in hero zone */}
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
                  <button onClick={() => navigate("/briefings")} className="mt-3 text-xs text-amber-400/70 hover:text-amber-300 transition-colors">
                    All briefings &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
