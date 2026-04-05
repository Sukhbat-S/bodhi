// ============================================================
// BODHI — Command Palette (Cmd+K)
// Keyboard-driven action bar for navigating, searching, and
// triggering actions across the entire dashboard.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { generateBuildlog, triggerBriefing } from "../api";

interface Command {
  id: string;
  label: string;
  category: "navigate" | "action" | "search";
  icon: string;
  action: () => void | Promise<void>;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const go = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  const commands: Command[] = [
    // Navigation
    { id: "home", label: "Go to Home", category: "navigate", icon: "~", action: () => go("/") },
    { id: "chat", label: "Go to Chat", category: "navigate", icon: ">", action: () => go("/chat") },
    { id: "search", label: "Go to Search", category: "navigate", icon: "?", action: () => go("/search") },
    { id: "memories", label: "Go to Memories", category: "navigate", icon: "#", action: () => go("/memories") },
    { id: "entities", label: "Go to Entity Graph", category: "navigate", icon: "*", action: () => go("/entities") },
    { id: "timeline", label: "Go to Timeline", category: "navigate", icon: "|", action: () => go("/timeline") },
    { id: "briefings", label: "Go to Briefings", category: "navigate", icon: "!", action: () => go("/briefings") },
    { id: "inbox", label: "Go to Inbox", category: "navigate", icon: "@", action: () => go("/inbox") },
    { id: "calendar", label: "Go to Calendar", category: "navigate", icon: "=", action: () => go("/calendar") },
    { id: "github", label: "Go to GitHub", category: "navigate", icon: "&", action: () => go("/github") },
    { id: "vercel", label: "Go to Vercel", category: "navigate", icon: "^", action: () => go("/vercel") },
    { id: "supabase", label: "Go to Supabase", category: "navigate", icon: "%", action: () => go("/supabase") },
    { id: "notion", label: "Go to Notion", category: "navigate", icon: "+", action: () => go("/notion") },
    { id: "ecosystem", label: "Go to Ecosystem", category: "navigate", icon: "o", action: () => go("/ecosystem") },
    { id: "quality", label: "Go to Quality", category: "navigate", icon: "q", action: () => go("/quality") },
    { id: "status", label: "Go to Status", category: "navigate", icon: "s", action: () => go("/status") },
    { id: "about", label: "Go to About Page", category: "navigate", icon: "i", action: () => go("/about") },

    // Actions
    {
      id: "buildlog",
      label: "Generate Build Log",
      category: "action",
      icon: "B",
      action: async () => {
        setLoading("Generating build log...");
        try {
          const res = await generateBuildlog({ days: 7 });
          setResult(res.buildlog.tweets.join("\n\n"));
        } catch {
          setResult("Failed to generate build log.");
        }
        setLoading(null);
      },
    },
    {
      id: "morning",
      label: "Trigger Morning Briefing",
      category: "action",
      icon: "M",
      action: async () => {
        setLoading("Triggering morning briefing...");
        try {
          await triggerBriefing("morning");
          setResult("Morning briefing sent to Telegram.");
        } catch {
          setResult("Failed to trigger briefing.");
        }
        setLoading(null);
      },
    },
    {
      id: "evening",
      label: "Trigger Evening Briefing",
      category: "action",
      icon: "E",
      action: async () => {
        setLoading("Triggering evening briefing...");
        try {
          await triggerBriefing("evening");
          setResult("Evening briefing sent to Telegram.");
        } catch {
          setResult("Failed to trigger briefing.");
        }
        setLoading(null);
      },
    },
    {
      id: "draft",
      label: "Draft X Post",
      category: "action",
      icon: "X",
      action: () => go("/chat?message=" + encodeURIComponent("Help me draft a build-in-public tweet about what I built recently.")),
    },
    {
      id: "pending",
      label: "What's Pending?",
      category: "action",
      icon: "P",
      action: () => go("/chat?message=" + encodeURIComponent("What items are pending from my recent sessions?")),
    },
  ];

  // Filter commands by query
  const filtered = query.trim()
    ? commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.id.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  // If query starts with "search ", offer a search action
  const searchMode = query.toLowerCase().startsWith("search ");
  const searchQuery = searchMode ? query.slice(7).trim() : "";

  const allItems = searchMode && searchQuery
    ? [{ id: "do-search", label: `Search memories: "${searchQuery}"`, category: "search" as const, icon: "?", action: () => go(`/search`) }, ...filtered]
    : filtered;

  // Keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setSelected(0);
        setResult(null);
        setLoading(null);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setResult(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelected(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && allItems[selected]) {
      e.preventDefault();
      allItems[selected].action();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => { setOpen(false); setResult(null); }}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-stone-700 bg-stone-900 shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center border-b border-stone-800 px-4">
          <span className="text-stone-500 text-sm mr-2">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-stone-100 py-3.5 text-sm placeholder-stone-500 focus:outline-none"
          />
          <kbd className="text-[10px] text-stone-600 border border-stone-700 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Loading */}
        {loading && (
          <div className="px-4 py-3 text-sm text-amber-400 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
            {loading}
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="px-4 py-3 border-b border-stone-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-stone-500 uppercase tracking-wider">Result</span>
              <button
                onClick={() => { navigator.clipboard.writeText(result); }}
                className="text-[10px] text-stone-500 hover:text-stone-300 transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{result}</p>
          </div>
        )}

        {/* Commands */}
        {!loading && (
          <div className="max-h-72 overflow-y-auto py-1">
            {allItems.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-stone-500">No commands found</div>
            ) : (
              allItems.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => cmd.action()}
                  onMouseEnter={() => setSelected(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected ? "bg-stone-800 text-stone-100" : "text-stone-400 hover:bg-stone-800/50"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono ${
                    cmd.category === "action"
                      ? "bg-amber-500/10 text-amber-400"
                      : cmd.category === "search"
                        ? "bg-violet-500/10 text-violet-400"
                        : "bg-stone-800 text-stone-500"
                  }`}>
                    {cmd.icon}
                  </span>
                  <span className="text-sm">{cmd.label}</span>
                  <span className="ml-auto text-[10px] text-stone-600">{cmd.category}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-stone-800 px-4 py-2 flex items-center gap-4 text-[10px] text-stone-600">
          <span>arrows to navigate</span>
          <span>enter to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
