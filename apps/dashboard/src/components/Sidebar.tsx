import { type ReactNode, useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import NotificationToggle from "./NotificationToggle";
import { BodhiLogo } from "./BodhiLogo";
import { getPendingMemoryCount, getGmailUnread, getGitHubActivity, getVercelDeployments, getCalendarToday } from "../api";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  badge?: number;
  statusDot?: "ok" | "warn" | "error";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { to: "/", label: "Reflection", icon: "reflection", end: true },
      { to: "/chat", label: "Chat", icon: "chat" },
      { to: "/search", label: "Search", icon: "search" },
      { to: "/missions", label: "Missions", icon: "missions" },
      { to: "/content", label: "Content", icon: "social" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/memories", label: "Memories", icon: "brain" },
      { to: "/entities", label: "Entities", icon: "entities" },
      { to: "/briefings", label: "Briefings", icon: "briefings" },
      { to: "/timeline", label: "Timeline", icon: "timeline" },
    ],
  },
];

const icons: Record<string, ReactNode> = {
  reflection: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3c-4.97 0-9 3.582-9 8 0 2.2 1.1 4.2 2.85 5.6L5 21l4.35-2.15C10.22 19 11.1 19 12 19c4.97 0 9-3.582 9-8s-4.03-8-9-8z" />
      <circle cx="12" cy="11" r="1" fill="currentColor" />
    </svg>
  ),
  timeline: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-3 3m3-3l3 3" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeWidth={1.5} d="M14 8h4M6 13h4M14 18h4" />
    </svg>
  ),
  pulse: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  briefings: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h2" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  brain: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  quality: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  notion: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  inbox: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  github: (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  vercel: (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1L24 22H0L12 1z" />
    </svg>
  ),
  supabase: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  entities: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="8" cy="8" r="2.5" strokeWidth={1.5} />
      <circle cx="16" cy="8" r="2.5" strokeWidth={1.5} />
      <circle cx="12" cy="17" r="2.5" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M10.2 9.2L12 15M13.8 9.2L12 15M9.8 9.5L14 9.5" />
    </svg>
  ),
  workflows: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
      <circle cx="18" cy="12" r="2" strokeWidth={2} />
    </svg>
  ),
  ecosystem: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2" strokeWidth={2} />
      <circle cx="5" cy="6" r="1.5" strokeWidth={2} />
      <circle cx="19" cy="6" r="1.5" strokeWidth={2} />
      <circle cx="5" cy="18" r="1.5" strokeWidth={2} />
      <circle cx="19" cy="18" r="1.5" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M6.5 7.5L10 10.5M13.5 10.5L17.5 7.5M6.5 16.5L10 13.5M13.5 13.5L17.5 16.5" />
    </svg>
  ),
  missions: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={1.5} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={1.5} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={1.5} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth={1.5} />
    </svg>
  ),
  social: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

// ─── Rail NavItem ────────────────────────────────────────────

function RailItem({ item, expanded, onClose }: { item: NavItem; expanded: boolean; onClose: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClose}
      title={expanded ? undefined : item.label}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-lg transition-colors ${
          expanded ? "px-3 py-2" : "justify-center p-2"
        } ${
          isActive
            ? "bg-steppe-gold/10 text-steppe-gold"
            : "text-steppe-smoke hover:text-steppe-cream hover:bg-steppe-sky/30"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-steppe-gold rounded-r" />}
          {icons[item.icon]}
          {expanded && <span className="text-sm font-medium truncate">{item.label}</span>}
          {item.badge != null && item.badge > 0 && (
            <span className={`text-[9px] font-semibold bg-steppe-gold/15 text-steppe-gold rounded-full min-w-[16px] text-center ${
              expanded ? "px-1.5 py-0.5 ml-auto" : "absolute -top-0.5 -right-0.5 px-1 py-0"
            }`}>
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
          {item.statusDot && !item.badge && (
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
              item.statusDot === "ok" ? "bg-emerald-400" : item.statusDot === "warn" ? "bg-amber-400" : "bg-red-400"
            }`} />
          )}
        </>
      )}
    </NavLink>
  );
}

// ─── Main Sidebar ────────────────────────────────────────────

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [pinned, setPinned] = useState(() => {
    return localStorage.getItem("sidebar-pinned") === "true";
  });
  const [hovering, setHovering] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prCount, setPrCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [deployState, setDeployState] = useState("");

  const expanded = pinned || hovering;

  useEffect(() => {
    localStorage.setItem("sidebar-pinned", String(pinned));
  }, [pinned]);


  const fetchPendingCount = useCallback(async () => {
    try {
      const { count } = await getPendingMemoryCount();
      setPendingCount(count);
    } catch { /* silent */ }
  }, []);

  const fetchServiceStatus = useCallback(async () => {
    getGmailUnread().then((r) => setUnreadCount(r.unread)).catch(() => {});
    getGitHubActivity().then((r) => setPrCount(r.prs.filter((p: { state: string }) => p.state === "open").length)).catch(() => {});
    getCalendarToday().then((r) => setEventCount(r.events.length)).catch(() => {});
    getVercelDeployments(1).then((r) => setDeployState(r.deployments[0]?.state?.toUpperCase() || "")).catch(() => {});
  }, []);

  useEffect(() => {
    fetchPendingCount();
    fetchServiceStatus();
    const interval = setInterval(() => { fetchPendingCount(); fetchServiceStatus(); }, 60_000);
    return () => clearInterval(interval);
  }, [fetchPendingCount, fetchServiceStatus]);

  const badgeMap: Record<string, number> = {
    Memories: pendingCount,
    Inbox: unreadCount,
    GitHub: prCount,
    Calendar: eventCount,
  };

  const groupsWithBadges = navGroups.map((g) => ({
    ...g,
    items: g.items.map((item) => ({
      ...item,
      badge: badgeMap[item.label] || 0,
      statusDot: item.label === "Vercel" ? (deployState === "READY" ? "ok" as const : deployState === "BUILDING" ? "warn" as const : deployState === "ERROR" ? "error" as const : undefined) : undefined,
    })),
  }));

  const visibleGroups = groupsWithBadges;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Mobile: full sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-[var(--steppe-night,#0f1b2d)] border-r border-steppe-shadow/40 flex flex-col transform transition-transform duration-200 ease-out md:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-steppe-shadow/40">
          <h1 className="text-lg font-bold text-steppe-cream tracking-wide flex items-center gap-2.5">
            <BodhiLogo className="w-9 h-9 text-steppe-gold" />
            BODHI
          </h1>
        </div>
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1.5 text-xs uppercase tracking-wider text-steppe-smoke">{group.label}</p>
              <div className="space-y-0.5 mt-0.5">
                {group.items.map((item) => (
                  <RailItem key={item.to} item={item} expanded={true} onClose={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-steppe-shadow/40">
          <NotificationToggle />
          <p className="text-xs text-steppe-smoke/60 mt-2">v{__APP_VERSION__}</p>
        </div>
      </aside>

      {/* Desktop: icon rail / expanded sidebar */}
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`hidden md:flex flex-col bg-[var(--steppe-night,#0f1b2d)] border-r border-steppe-shadow/40 transition-all duration-200 ease-out overflow-hidden ${
          expanded ? "w-52" : "w-14"
        }`}
      >
        {/* Logo */}
        <div className={`border-b border-steppe-shadow/40 flex items-center ${expanded ? "px-4 py-4 gap-2.5" : "justify-center py-4"}`}>
          <BodhiLogo className={`text-steppe-gold shrink-0 ${expanded ? "w-7 h-7" : "w-6 h-6"}`} />
          {expanded && <span className="text-sm font-bold text-steppe-cream tracking-wide">BODHI</span>}
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${expanded ? "p-2 space-y-3" : "p-1.5 space-y-1"}`}>
          {visibleGroups.map((group, gi) => (
            <div key={group.label}>
              {expanded ? (
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-steppe-smoke/60">{group.label}</p>
              ) : (
                gi > 0 && <div className="mx-2 my-1 border-t border-steppe-shadow/30" />
              )}
              <div className={expanded ? "space-y-0.5" : "space-y-0.5"}>
                {group.items.map((item) => (
                  <RailItem key={item.to} item={item} expanded={expanded} onClose={() => {}} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-steppe-shadow/40 ${expanded ? "p-3 space-y-2" : "p-1.5 space-y-1"}`}>
          {/* Pin toggle */}
          <button
            onClick={() => setPinned(!pinned)}
            title={pinned ? "Collapse sidebar" : "Pin sidebar"}
            className={`w-full flex items-center gap-2 rounded-lg transition-colors ${
              expanded ? "px-3 py-1.5 justify-start" : "justify-center p-2"
            } ${pinned ? "text-amber-400" : "text-steppe-smoke/60 hover:text-steppe-cream/70"} hover:bg-steppe-sky/30`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={pinned ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
            </svg>
            {expanded && <span className="text-[10px]">{pinned ? "Collapse" : "Pin open"}</span>}
          </button>

          {expanded && <p className="text-[10px] text-steppe-smoke/40 px-3">v{__APP_VERSION__}</p>}
        </div>
      </aside>
    </>
  );
}
