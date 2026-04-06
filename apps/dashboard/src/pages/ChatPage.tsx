import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  streamChat,
  getConversations,
  getConversation,
  deleteConversation,
  setTurnFeedback,
  type ChatMessage as ChatMsg,
  type ConversationThread,
  type TurnFeedback,
} from "../api";
import ChatMessage from "../components/ChatMessage";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface DisplayMessage extends ChatMsg {
  turnId?: string;
  feedback?: TurnFeedback | null;
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);

  // Conversation state
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Load conversations on mount
  const loadThreads = useCallback(async () => {
    try {
      const result = await getConversations(50);
      setThreads(result.threads);
    } catch {
      // Silently fail — threads list is non-critical
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Auto-send message from URL query param
  useEffect(() => {
    const msg = searchParams.get("message");
    if (msg && !autoSentRef.current && !streaming) {
      autoSentRef.current = true;
      setSearchParams({}, { replace: true });
      setInput("");
      setMessages([{ role: "user", content: msg }]);
      setStreaming(true);
      setStreamingContent("");
      let accumulated = "";
      streamChat(
        msg,
        (chunk) => { accumulated += chunk; setStreamingContent(accumulated); },
        (full, threadId) => {
          setMessages((prev) => [...prev, { role: "assistant", content: full || accumulated }]);
          setStreamingContent("");
          setStreaming(false);
          if (threadId) setActiveThreadId(threadId);
          loadThreads();
        },
      ).then((tid) => { if (tid && !activeThreadId) setActiveThreadId(tid); })
       .catch((err) => {
         setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Failed"}` }]);
         setStreamingContent("");
         setStreaming(false);
       });
    }
  }, [searchParams]);

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try { await deleteConversation(id); } catch { /* skip */ }
    }
    setThreads((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    if (activeThreadId && selectedIds.has(activeThreadId)) handleNewChat();
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setStreamingContent("");
    inputRef.current?.focus();
  };

  const handleSelectThread = async (threadId: string) => {
    if (threadId === activeThreadId) return;
    try {
      const { turns } = await getConversation(threadId);
      setActiveThreadId(threadId);
      setMessages(
        turns.map((t) => ({
          role: t.role,
          content: t.content,
          turnId: t.id,
          feedback: t.feedback,
        }))
      );
      setStreamingContent("");
    } catch {
      // Failed to load — ignore
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    setDeletingId(null);
    try {
      await deleteConversation(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        handleNewChat();
      }
    } catch {
      // Deletion failed — ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || streaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setStreaming(true);
    setStreamingContent("");

    try {
      let accumulated = "";
      const returnedThreadId = await streamChat(
        msg,
        (chunk) => {
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        (full, threadId) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: full || accumulated },
          ]);
          setStreamingContent("");
          setStreaming(false);
          // Update threadId from done event if available
          if (threadId) {
            setActiveThreadId(threadId);
          }
        },
        activeThreadId ?? undefined
      );

      // Set threadId from first SSE event (new thread)
      if (returnedThreadId && !activeThreadId) {
        setActiveThreadId(returnedThreadId);
      }

      // Refresh thread list to show new/updated thread
      loadThreads();
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Failed to send message";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errMsg}` },
      ]);
      setStreamingContent("");
      setStreaming(false);
    }

    inputRef.current?.focus();
  };

  const handleFeedback = async (
    turnId: string,
    rating: "helpful" | "unhelpful",
    text?: string
  ) => {
    if (!activeThreadId) return;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.turnId === turnId
          ? { ...m, feedback: { rating, text, at: new Date().toISOString() } }
          : m
      )
    );
    try {
      await setTurnFeedback(activeThreadId, turnId, { rating, text });
    } catch {
      // Revert on failure
      setMessages((prev) =>
        prev.map((m) =>
          m.turnId === turnId ? { ...m, feedback: null } : m
        )
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full">
      {/* Conversation list panel */}
      <div className="w-64 border-r border-stone-800 flex flex-col bg-stone-950/50">
        <div className="p-3 border-b border-stone-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleNewChat}
              className="flex-1 px-3 py-2 text-sm font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
            >
              + New chat
            </button>
            {threads.length > 0 && (
              <button
                onClick={() => {
                  if (selectMode) {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  } else {
                    setSelectMode(true);
                  }
                }}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  selectMode
                    ? "text-amber-400 bg-amber-500/15 hover:bg-amber-500/25"
                    : "text-stone-500 bg-stone-800 hover:bg-stone-700 hover:text-stone-300"
                }`}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
          </div>
          {selectMode && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedIds.size === threads.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(threads.map((t) => t.id)));
                  }
                }}
                className="flex-1 px-2 py-1.5 text-xs text-stone-400 hover:text-stone-300 bg-stone-900 rounded transition-colors"
              >
                {selectedIds.size === threads.length ? "Deselect all" : "Select all"}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className="flex-1 px-2 py-1.5 text-xs text-red-400 hover:text-red-300 bg-stone-900 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Delete ({selectedIds.size})
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-4 text-xs text-stone-600">Loading...</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-xs text-stone-600">No conversations yet</div>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => selectMode ? toggleSelect(thread.id) : handleSelectThread(thread.id)}
                className={`group relative px-3 py-2.5 cursor-pointer border-b border-stone-900 transition-colors ${
                  selectMode && selectedIds.has(thread.id)
                    ? "bg-amber-500/10"
                    : activeThreadId === thread.id
                    ? "bg-stone-800/60"
                    : "hover:bg-stone-900/50"
                }`}
              >
                <div className="text-sm text-stone-300 truncate pr-6 flex items-center gap-1.5">
                  {selectMode && (
                    <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      selectedIds.has(thread.id)
                        ? "bg-amber-500 border-amber-500"
                        : "border-stone-600"
                    }`}>
                      {selectedIds.has(thread.id) && (
                        <svg className="w-3 h-3 text-stone-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className="truncate">{thread.title || "Untitled"}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                    thread.channel === "telegram"
                      ? "bg-blue-500/15 text-blue-400"
                      : "bg-stone-700 text-stone-500"
                  }`}>
                    {thread.channel === "telegram" ? "tg" : thread.channel}
                  </span>
                </div>
                <div className="text-xs text-stone-600 mt-0.5">
                  {relativeTime(thread.lastActiveAt)}
                </div>

                {/* Delete button (hidden in select mode) */}
                {selectMode ? null : deletingId === thread.id ? (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(thread.id);
                      }}
                      className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300 bg-stone-800 rounded"
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(null);
                      }}
                      className="px-1.5 py-0.5 text-xs text-stone-400 hover:text-stone-300 bg-stone-800 rounded"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(thread.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-400 transition-opacity"
                    title="Delete"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <span className="text-4xl mb-3">🌳</span>
              <h3 className="text-lg font-medium text-stone-300 mb-1">
                Chat with BODHI
              </h3>
              <p className="text-sm text-stone-500 max-w-sm">
                Send a message to start a conversation. Responses are powered by
                Claude Code CLI through the Bridge.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.turnId || i}
              role={msg.role}
              content={msg.content}
              turnId={msg.turnId}
              threadId={activeThreadId ?? undefined}
              feedback={msg.feedback}
              onFeedback={handleFeedback}
            />
          ))}

          {streaming && streamingContent && (
            <ChatMessage
              role="assistant"
              content={streamingContent}
              isStreaming
            />
          )}

          {streaming && !streamingContent && (
            <ChatMessage role="assistant" content="" isStreaming />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-stone-800 p-4 bg-stone-950">
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              rows={1}
              disabled={streaming}
              className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-600 focus:border-stone-600 resize-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-5 py-3 bg-stone-700 hover:bg-stone-600 text-stone-100 text-sm font-medium rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
