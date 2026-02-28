// ============================================================
// BODHI Dashboard — API Client
// Fetch wrapper for /api/* calls to Hono server
// ============================================================

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// --- Status ---

export interface StatusResponse {
  agent: string;
  bridge: string;
  memory: string;
  notion?: string;
  gmail?: string;
  calendar?: string;
  scheduler?: string;
  uptime: number;
  channels: Record<string, string>;
}

export function getStatus() {
  return request<StatusResponse>("/status");
}

// --- Memories ---

export interface Memory {
  id: string;
  content: string;
  type: string;
  importance: number;
  confidence: number;
  similarity: number;
  createdAt: string;
  tags: string[] | null;
  accessCount?: number;
  lastAccessedAt?: string | null;
}

export interface MemoriesResponse {
  memories: Memory[];
  total: number;
}

export interface MemoryStats {
  totalMemories: number;
  topTags: { tag: string; count: number }[];
  recentCount: number;
}

export function getMemories(params?: {
  limit?: number;
  offset?: number;
  tag?: string;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();
  return request<MemoriesResponse>(`/memories${query ? `?${query}` : ""}`);
}

export function getMemoryStats() {
  return request<MemoryStats>("/memories/stats");
}

export function searchMemories(q: string, limit = 10) {
  return request<{ memories: Memory[] }>(
    `/memories/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export function createMemory(data: {
  content: string;
  tags?: string[];
  importance?: number;
}) {
  return request<{ id: string }>("/memories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteMemory(id: string) {
  return request<{ deleted: boolean }>(`/memories/${id}`, {
    method: "DELETE",
  });
}

// --- Scheduler ---

export interface SchedulerJob {
  type: "morning" | "evening" | "weekly";
  lastRun: string | null;
  lastResult: "sent" | "skipped" | "error" | null;
  lastDurationMs: number | null;
}

export interface SchedulerStatus {
  running: boolean;
  timezone: string;
  jobs: SchedulerJob[];
}

export function getSchedulerStatus() {
  return request<SchedulerStatus>("/scheduler");
}

export function triggerBriefing(type: "morning" | "evening" | "weekly") {
  return request<{ status: string; content?: string; error?: string }>(
    "/scheduler/trigger",
    {
      method: "POST",
      body: JSON.stringify({ type }),
    }
  );
}

// --- Conversations ---

export interface ConversationThread {
  id: string;
  channel: string;
  title: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function getConversations(limit = 20, offset = 0) {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  if (offset) qs.set("offset", String(offset));
  const query = qs.toString();
  return request<{ threads: ConversationThread[]; total: number }>(
    `/conversations${query ? `?${query}` : ""}`
  );
}

export function getConversation(id: string) {
  return request<{ thread: ConversationThread; turns: ConversationTurn[] }>(
    `/conversations/${id}`
  );
}

export function deleteConversation(id: string) {
  return request<{ deleted: boolean }>(`/conversations/${id}`, {
    method: "DELETE",
  });
}

// --- Chat ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamChat(
  message: string,
  onChunk: (text: string) => void,
  onDone: (full: string, threadId?: string) => void,
  threadId?: string
): Promise<string | undefined> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, threadId }),
  });

  if (!res.ok) {
    throw new Error(`Chat failed: ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let resolvedThreadId: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "thread") {
            resolvedThreadId = event.threadId;
          } else if (event.type === "chunk") {
            onChunk(event.content);
          } else if (event.type === "done") {
            onDone(event.content, event.threadId);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }

  return resolvedThreadId;
}
