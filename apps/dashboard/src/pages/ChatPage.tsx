import { useState, useRef, useEffect, useCallback } from "react";
import {
  streamChat,
  getConversations,
  getConversation,
  deleteConversation,
  type ChatMessage as ChatMsg,
  type ConversationThread,
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

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Conversation state
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      setMessages(turns.map((t) => ({ role: t.role, content: t.content })));
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
        <div className="p-3 border-b border-stone-800">
          <button
            onClick={handleNewChat}
            className="w-full px-3 py-2 text-sm font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
          >
            + New chat
          </button>
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
                onClick={() => handleSelectThread(thread.id)}
                className={`group relative px-3 py-2.5 cursor-pointer border-b border-stone-900 transition-colors ${
                  activeThreadId === thread.id
                    ? "bg-stone-800/60"
                    : "hover:bg-stone-900/50"
                }`}
              >
                <div className="text-sm text-stone-300 truncate pr-6">
                  {thread.title || "Untitled"}
                </div>
                <div className="text-xs text-stone-600 mt-0.5">
                  {relativeTime(thread.lastActiveAt)}
                </div>

                {/* Delete button */}
                {deletingId === thread.id ? (
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
            <ChatMessage key={i} role={msg.role} content={msg.content} />
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
