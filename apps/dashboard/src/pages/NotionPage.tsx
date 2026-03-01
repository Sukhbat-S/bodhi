import { useEffect, useState, useCallback } from "react";
import {
  getNotionStatus,
  getNotionTasks,
  getNotionSessions,
  searchNotion,
  type NotionTask,
  type NotionSession,
} from "../api";

const statusColor: Record<string, string> = {
  "In progress": "bg-amber-500/15 text-amber-400",
  "Not started": "bg-stone-700 text-stone-400",
  Done: "bg-green-500/15 text-green-400",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function NotionPage() {
  const [tasks, setTasks] = useState<NotionTask[]>([]);
  const [sessions, setSessions] = useState<NotionSession[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<
    { title: string; url: string; type: string }[] | null
  >(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const status = await getNotionStatus().catch(() => ({
        connected: false,
        databases: { tasks: false, sessions: false },
      }));
      setConnected(status.connected);
      if (!status.connected) {
        setLoading(false);
        return;
      }

      const [taskRes, sessionRes] = await Promise.all([
        getNotionTasks("active").catch(() => ({ tasks: [] })),
        getNotionSessions(10).catch(() => ({ sessions: [] })),
      ]);

      setTasks(taskRes.tasks);
      setSessions(sessionRes.sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Notion data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await searchNotion(q);
      setSearchResults(res.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="p-8 max-w-4xl">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Notion</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-stone-200 mb-2">
            Notion Not Connected
          </h3>
          <p className="text-sm text-stone-400 mb-4">
            Set NOTION_TOKEN and database IDs in .env to connect
          </p>
          <p className="text-xs text-stone-500">
            See{" "}
            <code className="bg-stone-800 px-1.5 py-0.5 rounded">
              packages/notion/README.md
            </code>{" "}
            for setup instructions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Notion</h2>
        <p className="text-sm text-stone-400 mt-1">Tasks & dev sessions</p>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Notion pages..."
            className="flex-1 bg-stone-900 border border-stone-800 rounded-lg px-4 py-2.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-600 focus:border-stone-600"
          />
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
          {searchResults !== null && (
            <button
              type="button"
              onClick={() => {
                setSearchResults(null);
                setSearchInput("");
              }}
              className="px-4 py-2.5 text-stone-400 hover:text-stone-200 text-sm rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Search Results */}
      {searchResults !== null && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-stone-100 mb-4">
            Search Results
          </h3>
          {searchResults.length === 0 ? (
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
              <p className="text-sm text-stone-400">No results found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:border-stone-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-stone-200">{r.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-700 text-stone-500 uppercase">
                      {r.type}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Tasks */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Active Tasks
        </h3>
        {tasks.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No active tasks</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <a
                key={task.id}
                href={task.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-stone-200 flex-1 truncate">
                    {task.title}
                  </span>
                  {task.status && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        statusColor[task.status] || "bg-stone-700 text-stone-400"
                      }`}
                    >
                      {task.status}
                    </span>
                  )}
                  {task.due && (
                    <span className="text-xs text-stone-500">
                      {formatDate(task.due)}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Dev Sessions */}
      <div>
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Dev Sessions
        </h3>
        {sessions.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No sessions recorded</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-stone-500 w-14 shrink-0">
                    #{s.sessionNumber}
                  </span>
                  <span className="text-sm text-stone-200 flex-1 truncate">
                    {s.focus || "Untitled session"}
                  </span>
                  {s.phase && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-700 text-stone-500">
                      {s.phase}
                    </span>
                  )}
                  {s.deployed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                      deployed
                    </span>
                  )}
                  {s.date && (
                    <span className="text-xs text-stone-600">
                      {formatDate(s.date)}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-stone-600 text-center">
        {tasks.length} active tasks · {sessions.length} recent sessions
      </div>
    </div>
  );
}
