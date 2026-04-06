import { useEffect, useState, useCallback } from "react";
import {
  getMemories,
  searchMemories,
  deleteMemory,
  getPendingMemories,
  confirmMemory,
  rejectMemory,
  type Memory,
} from "../api";
import MemoryCard from "../components/MemoryCard";

const PAGE_SIZE = 20;

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingMemories, setPendingMemories] = useState<Memory[]>([]);
  const [showPending, setShowPending] = useState(true);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSearchMode && search) {
        const result = await searchMemories(search);
        setMemories(result.memories);
        setTotal(result.memories.length);
      } else {
        const result = await getMemories({
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          ...(activeTag ? { tag: activeTag } : {}),
        });
        setMemories(result.memories);
        setTotal(result.total);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [page, search, isSearchMode, activeTag]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Load pending memories
  const loadPending = useCallback(async () => {
    try {
      const { memories: pending } = await getPendingMemories();
      setPendingMemories(pending);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleConfirm = async (id: string) => {
    try {
      await confirmMemory(id);
      setPendingMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // Failed
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectMemory(id);
      setPendingMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // Failed
    }
  };

  const handleConfirmAll = async () => {
    for (const m of pendingMemories) {
      try { await confirmMemory(m.id); } catch { /* skip */ }
    }
    setPendingMemories([]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearch(searchInput.trim());
      setIsSearchMode(true);
      setPage(0);
    }
  };

  const clearSearch = () => {
    setSearch("");
    setSearchInput("");
    setIsSearchMode(false);
    setPage(0);
  };

  const handleTagClick = (tag: string) => {
    setActiveTag(tag);
    setIsSearchMode(false);
    setSearch("");
    setSearchInput("");
    setPage(0);
  };

  const clearTag = () => {
    setActiveTag(null);
    setPage(0);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setTotal((prev) => prev - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete memory");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Memories</h2>
        <span className="text-sm text-stone-500">{total} total</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search memories (semantic vector search)..."
            className="flex-1 bg-stone-900 border border-stone-800 rounded-lg px-4 py-2.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-600 focus:border-stone-600"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-medium rounded-lg transition-colors"
          >
            Search
          </button>
          {isSearchMode && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-4 py-2.5 text-stone-400 hover:text-stone-200 text-sm rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Pending Review */}
      {pendingMemories.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowPending(!showPending)}
            className="flex items-center gap-2 mb-3"
          >
            <span className="text-sm font-medium text-amber-400">
              Pending Review ({pendingMemories.length})
            </span>
            <svg
              className={`w-4 h-4 text-amber-400 transition-transform ${showPending ? "" : "-rotate-90"}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showPending && (
            <div className="space-y-2">
              {pendingMemories.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-300">{m.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] uppercase font-medium text-stone-500 bg-stone-800 px-1.5 py-0.5 rounded">
                        {m.type}
                      </span>
                      <span className="text-[10px] text-stone-600">
                        importance: {m.importance.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleConfirm(m.id)}
                      className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      title="Confirm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleReject(m.id)}
                      className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Reject"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={handleConfirmAll}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Confirm all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active tag filter */}
      {activeTag && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-stone-500">Filtered by tag:</span>
          <span className="inline-flex items-center gap-1 text-xs bg-stone-800 text-stone-300 px-2.5 py-1 rounded-full">
            {activeTag}
            <button
              onClick={clearTag}
              className="ml-0.5 text-stone-500 hover:text-stone-300 transition-colors"
            >
              &times;
            </button>
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-stone-500 animate-pulse">
          Loading memories...
        </div>
      )}

      {/* Memory List */}
      {!loading && memories.length === 0 && (
        <div className="text-center py-12 text-stone-500">
          {isSearchMode ? "No matching memories found." : "No memories yet."}
        </div>
      )}

      {!loading && memories.length > 0 && (
        <div className="space-y-3">
          {memories.map((m) => (
            <MemoryCard key={m.id} memory={m} onDelete={handleDelete} onTagClick={handleTagClick} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isSearchMode && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-stone-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
