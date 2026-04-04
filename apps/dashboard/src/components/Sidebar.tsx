import { type ReactNode, useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import NotificationToggle from "./NotificationToggle";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

interface NavGroup {
  label: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { to: "/", label: "Reflection", icon: "reflection", end: true },
      { to: "/chat", label: "Chat", icon: "chat" },
      { to: "/search", label: "Search", icon: "search" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/memories", label: "Memories", icon: "brain" },
      { to: "/briefings", label: "Briefings", icon: "briefings" },
      { to: "/timeline", label: "Timeline", icon: "timeline" },
    ],
  },
  {
    label: "Awareness",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { to: "/calendar", label: "Calendar", icon: "calendar" },
      { to: "/inbox", label: "Inbox", icon: "inbox" },
      { to: "/github", label: "GitHub", icon: "github" },
      { to: "/vercel", label: "Vercel", icon: "vercel" },
      { to: "/supabase", label: "Supabase", icon: "supabase" },
    ],
  },
  {
    label: "System",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { to: "/status", label: "Status", icon: "pulse" },
      { to: "/quality", label: "Quality", icon: "quality" },
      { to: "/ecosystem", label: "Ecosystem", icon: "ecosystem" },
      { to: "/notion", label: "Notion", icon: "notion" },
    ],
  },
];

const icons: Record<string, ReactNode> = {
  reflection: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3c-4.97 0-9 3.582-9 8 0 2.2 1.1 4.2 2.85 5.6L5 21l4.35-2.15C10.22 19 11.1 19 12 19c4.97 0 9-3.582 9-8s-4.03-8-9-8z" />
      <circle cx="12" cy="11" r="1" fill="currentColor" />
    </svg>
  ),
  timeline: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-3 3m3-3l3 3" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeWidth={1.5} d="M14 8h4M6 13h4M14 18h4" />
    </svg>
  ),
  pulse: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  briefings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h2" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  brain: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  quality: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  notion: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  inbox: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  github: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  vercel: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1L24 22H0L12 1z" />
    </svg>
  ),
  supabase: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  ecosystem: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2" strokeWidth={2} />
      <circle cx="5" cy="6" r="1.5" strokeWidth={2} />
      <circle cx="19" cy="6" r="1.5" strokeWidth={2} />
      <circle cx="5" cy="18" r="1.5" strokeWidth={2} />
      <circle cx="19" cy="18" r="1.5" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M6.5 7.5L10 10.5M13.5 10.5L17.5 7.5M6.5 16.5L10 13.5M13.5 13.5L17.5 16.5" />
    </svg>
  ),
  chevron: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
};

// Bodhi leaf logo SVG
function BodhiLogo() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 100 140" fill="none" stroke="#d97706" strokeWidth="3">
      {/* Leaf */}
      <path d="M50 15 C25 35, 15 60, 50 95 C85 60, 75 35, 50 15Z" strokeLinejoin="round" />
      <path d="M50 30 L50 85" strokeLinecap="round" />
      <path d="M50 50 C40 45, 30 50, 25 55" strokeLinecap="round" />
      <path d="M50 65 C60 60, 70 65, 75 70" strokeLinecap="round" />
      {/* Geometric roots */}
      <circle cx="50" cy="100" r="3" fill="#d97706" />
      <circle cx="35" cy="115" r="2.5" fill="#d97706" />
      <circle cx="65" cy="115" r="2.5" fill="#d97706" />
      <circle cx="25" cy="128" r="2" fill="#d97706" />
      <circle cx="50" cy="125" r="2" fill="#d97706" />
      <circle cx="75" cy="128" r="2" fill="#d97706" />
      <line x1="50" y1="100" x2="35" y2="115" />
      <line x1="50" y1="100" x2="65" y2="115" />
      <line x1="35" y1="115" x2="25" y2="128" />
      <line x1="35" y1="115" x2="50" y2="125" />
      <line x1="65" y1="115" x2="50" y2="125" />
      <line x1="65" y1="115" x2="75" y2="128" />
    </svg>
  );
}

function CollapsibleGroup({
  group,
  onClose,
}: {
  group: NavGroup;
  onClose: () => void;
}) {
  const storageKey = `sidebar-${group.label}`;
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : (group.defaultCollapsed ?? false);
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(collapsed));
  }, [collapsed, storageKey]);

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs uppercase tracking-wider text-stone-500 hover:text-stone-400 transition-colors"
      >
        {group.label}
        <span className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}>
          {icons.chevron}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5 mt-0.5">
          {group.items.map((item) => (
            <NavItem key={item.to} item={item} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-amber-500/10 text-amber-400 border-l-2 border-amber-500 -ml-[2px]"
            : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/50"
        }`
      }
    >
      {icons[item.icon]}
      {item.label}
    </NavLink>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [mode, setMode] = useState<"personal" | "builder">(() => {
    return (localStorage.getItem("sidebar-mode") as "personal" | "builder") || "personal";
  });

  useEffect(() => {
    localStorage.setItem("sidebar-mode", mode);
  }, [mode]);

  const visibleGroups = mode === "personal"
    ? navGroups.filter((g) => g.label === "Core" || g.label === "Knowledge")
    : navGroups;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-stone-950 border-r border-stone-800/60 flex flex-col transform transition-transform duration-200 ease-out md:relative md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-stone-800/60">
          <h1 className="text-lg font-bold text-stone-100 tracking-wide flex items-center gap-2.5">
            <BodhiLogo />
            BODHI
          </h1>
          <p className="text-xs text-stone-500 mt-1">See yourself clearly.</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {visibleGroups.map((group) =>
            group.collapsible ? (
              <CollapsibleGroup key={group.label} group={group} onClose={onClose} />
            ) : (
              <div key={group.label}>
                <p className="px-3 py-1.5 text-xs uppercase tracking-wider text-stone-500">
                  {group.label}
                </p>
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map((item) => (
                    <NavItem key={item.to} item={item} onClose={onClose} />
                  ))}
                </div>
              </div>
            )
          )}
        </nav>

        {/* Mode Toggle + Footer */}
        <div className="p-4 border-t border-stone-800/60 space-y-3">
          <div className="flex rounded-lg bg-stone-900/80 p-0.5">
            <button
              onClick={() => setMode("personal")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                mode === "personal"
                  ? "bg-amber-500/15 text-amber-400 font-medium"
                  : "text-stone-500 hover:text-stone-400"
              }`}
            >
              Personal
            </button>
            <button
              onClick={() => setMode("builder")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                mode === "builder"
                  ? "bg-amber-500/15 text-amber-400 font-medium"
                  : "text-stone-500 hover:text-stone-400"
              }`}
            >
              Builder
            </button>
          </div>
          <NotificationToggle />
          <p className="text-xs text-stone-600">v0.9.0</p>
        </div>
      </aside>
    </>
  );
}
