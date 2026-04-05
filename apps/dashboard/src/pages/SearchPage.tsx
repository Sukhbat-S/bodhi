import { useState, useCallback, useRef, useEffect } from "react";
import { searchMemories, type Memory } from "../api";

const TYPE_COLORS: Record<string, string> = {
  fact: "bg-blue-500/10 text-blue-400",
  decision: "bg-emerald-500/10 text-emerald-400",
  pattern: "bg-violet-500/10 text-violet-400",
  preference: "bg-amber-500/10 text-amber-400",
  event: "bg-rose-500/10 text-rose-400",
};

function formatAge(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  if (diffD < 30) return `${Math.floor(diffD / 7)}w ago`;
  return `${Math.floor(diffD / 30)}mo ago`;
}

const MEMORY_TYPES = ["fact", "decision", "pattern", "preference", "event"] as const;

const EXAMPLE_QUERIES = [
  "deployment patterns",
  "recent decisions",
  "session summaries",
  "architecture choices",
  "debugging lessons",
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredResults = typeFilter
    ? results.filter((m) => m.type === typeFilter)
    : results;

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const data = await searchMemories(q, 20);
      setResults(data.memories);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-stone-100 mb-4">Search Memories</h1>

      {/* Search bar */}
      <div className="sticky top-0 z-10 bg-stone-950/80 backdrop-blur-sm pb-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search memories..."
            className="w-full bg-stone-900 text-stone-100 pl-10 pr-4 py-3 rounded-xl border border-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-600 placeholder-stone-500"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-stone-600 border-t-stone-300 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Type filter chips */}
      {hasSearched && results.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              typeFilter === null
                ? "bg-stone-700 text-stone-100"
                : "bg-stone-800/60 text-stone-500 hover:text-stone-300"
            }`}
          >
            All ({results.length})
          </button>
          {MEMORY_TYPES.map((t) => {
            const count = results.filter((m) => m.type === t).length;
            if (count === 0) return null;
            const color = TYPE_COLORS[t] || TYPE_COLORS.fact;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  typeFilter === t ? color : "bg-stone-800/60 text-stone-500 hover:text-stone-300"
                }`}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Result count */}
      {hasSearched && results.length > 0 && (
        <p className="text-xs text-stone-600 mb-3">
          {typeFilter ? `${filteredResults.length} of ${results.length}` : results.length} results
        </p>
      )}

      {/* Results */}
      {!hasSearched ? (
        <div className="text-center py-16 text-stone-500">
          <p className="text-lg font-medium mb-2">Search your memory</p>
          <p className="text-sm mb-6">
            Semantic similarity search across all memories
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((eq) => (
              <button
                key={eq}
                onClick={() => { setQuery(eq); search(eq); }}
                className="text-xs px-3 py-1.5 rounded-full bg-stone-800/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-colors"
              >
                {eq}
              </button>
            ))}
          </div>
        </div>
      ) : filteredResults.length === 0 && !loading ? (
        <div className="text-center py-16 text-stone-500">
          <p className="text-lg font-medium">No results found</p>
          <p className="text-sm mt-1">Try a different query</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((m) => {
            const typeColor = TYPE_COLORS[m.type] || TYPE_COLORS.fact;
            const pct = m.similarity ? Math.round(m.similarity * 100) : 0;
            const barColor = pct >= 80 ? "bg-emerald-500/60" : pct >= 50 ? "bg-amber-500/60" : "bg-red-500/40";
            return (
              <div
                key={m.id}
                className="bg-stone-900 border border-stone-800 rounded-lg p-4 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${typeColor}`}
                  >
                    {m.type}
                  </span>
                  {m.tags?.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="text-[11px] text-stone-600 ml-auto">
                    {formatAge(m.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-stone-300 leading-relaxed break-words">{m.content}</p>
                {pct > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 max-w-[120px] bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-medium ${pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-stone-600"}`}>
                      {pct}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
