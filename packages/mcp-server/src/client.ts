// ============================================================
// BODHI MCP Server — HTTP Client for BODHI API
// Wraps BODHI's REST endpoints (localhost:4000) for MCP tools
// ============================================================

const BODHI_BASE_URL = process.env.BODHI_URL || "http://localhost:4000";

/** Generic fetch wrapper with error handling */
async function bodhiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const url = `${BODHI_BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `BODHI API error (${response.status}): ${body || response.statusText}`,
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED"))
    ) {
      return {
        ok: false,
        error:
          "BODHI server is not running. Start it with: cd ~/Documents/bodhi && npm run dev -w @seneca/server",
      };
    }
    return {
      ok: false,
      error: `Failed to reach BODHI: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// --------------------------------------------------
// Memory APIs
// --------------------------------------------------

export interface MemoryResult {
  id: string;
  content: string;
  type: string;
  importance: number;
  confidence: number;
  similarity: number;
  createdAt: string;
  tags: string[] | null;
}

export async function searchMemories(
  query: string,
  limit = 10,
): Promise<string> {
  const result = await bodhiFetch<{ memories: MemoryResult[] }>(
    `/api/memories/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );

  if (!result.ok) return result.error;

  const { memories } = result.data;
  if (memories.length === 0) {
    return `No memories found for "${query}".`;
  }

  return memories
    .map((m, i) => {
      const sim = Math.round(m.similarity * 100);
      const date = new Date(m.createdAt).toLocaleDateString();
      const tags = m.tags?.length ? ` [${m.tags.join(", ")}]` : "";
      return `${i + 1}. [${m.type}] ${m.content} (${sim}% match, ${date})${tags}`;
    })
    .join("\n");
}

export async function storeMemory(input: {
  content: string;
  type?: string;
  importance?: number;
  tags?: string[];
}): Promise<string> {
  const result = await bodhiFetch<{ id: string }>("/api/memories", {
    method: "POST",
    body: JSON.stringify({
      content: input.content,
      type: input.type || "fact",
      importance: input.importance ?? 0.7,
      tags: input.tags,
    }),
  });

  if (!result.ok) return result.error;
  return `Memory stored (id: ${result.data.id}). BODHI will remember this.`;
}

export async function getMemoryStats(): Promise<string> {
  const result = await bodhiFetch<{
    totalMemories: number;
    topTags: { tag: string; count: number }[];
    recentCount: number;
  }>("/api/memories/stats");

  if (!result.ok) return result.error;

  const { totalMemories, topTags, recentCount } = result.data;
  const tagList =
    topTags.length > 0
      ? topTags.map((t) => `  ${t.tag}: ${t.count}`).join("\n")
      : "  (none)";

  return [
    `Total memories: ${totalMemories}`,
    `Recent (24h): ${recentCount}`,
    `Top tags:\n${tagList}`,
  ].join("\n");
}

// --------------------------------------------------
// Conversations API
// --------------------------------------------------

interface Thread {
  id: string;
  channel: string;
  title: string | null;
  createdAt: string;
  lastActiveAt: string;
}

interface Turn {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export async function getRecentConversations(limit = 5): Promise<string> {
  const result = await bodhiFetch<{ threads: Thread[]; total: number }>(
    `/api/conversations?limit=${limit}`,
  );

  if (!result.ok) return result.error;

  const { threads } = result.data;
  if (threads.length === 0) {
    return "No recent conversations.";
  }

  // Fetch turns for the most recent 3 threads (to keep output manageable)
  const detailed = await Promise.all(
    threads.slice(0, 3).map(async (thread) => {
      const turnsResult = await bodhiFetch<{
        thread: Thread;
        turns: Turn[];
      }>(`/api/conversations/${thread.id}`);

      if (!turnsResult.ok) {
        return `## ${thread.title || "Untitled"} (${thread.channel})\n  (failed to load turns)`;
      }

      const turns = turnsResult.data.turns.slice(-4); // Last 4 turns
      const turnLines = turns
        .map((t) => {
          const preview =
            t.content.length > 200
              ? t.content.slice(0, 200) + "..."
              : t.content;
          return `  ${t.role}: ${preview}`;
        })
        .join("\n");

      const ago = timeAgo(new Date(thread.lastActiveAt));
      return `## ${thread.title || "Untitled"} (${thread.channel}, ${ago})\n${turnLines}`;
    }),
  );

  // Add summary for remaining threads
  const remaining = threads.slice(3).map((t) => {
    const ago = timeAgo(new Date(t.lastActiveAt));
    return `- ${t.title || "Untitled"} (${t.channel}, ${ago})`;
  });

  let output = detailed.join("\n\n");
  if (remaining.length > 0) {
    output += "\n\nOlder threads:\n" + remaining.join("\n");
  }

  return output;
}

// --------------------------------------------------
// Today's Context (composite)
// --------------------------------------------------

export async function getTodaysContext(): Promise<string> {
  // Fetch all three in parallel
  const [calResult, gmailResult, statusResult] = await Promise.all([
    bodhiFetch<{ events: Array<{ summary: string; start: string; end: string }> }>(
      "/api/calendar/today",
    ),
    bodhiFetch<{ unread: number }>("/api/gmail/unread"),
    bodhiFetch<Record<string, unknown>>("/api/status"),
  ]);

  const sections: string[] = [];

  // Calendar
  if (calResult.ok) {
    const events = calResult.data.events;
    if (events.length === 0) {
      sections.push("Calendar: No events today.");
    } else {
      const eventList = events
        .map((e) => {
          const start = new Date(e.start).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const end = new Date(e.end).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          return `  ${start}-${end}: ${e.summary}`;
        })
        .join("\n");
      sections.push(`Calendar (${events.length} events):\n${eventList}`);
    }
  } else {
    sections.push(`Calendar: ${calResult.error}`);
  }

  // Gmail
  if (gmailResult.ok) {
    sections.push(`Unread emails: ${gmailResult.data.unread}`);
  } else {
    sections.push(`Gmail: ${gmailResult.error}`);
  }

  // Status
  if (statusResult.ok) {
    const s = statusResult.data;
    sections.push(
      `BODHI status: agent=${s.agent}, bridge=${s.bridge}, memory=${s.memory}, notion=${s.notion}`,
    );
  }

  return sections.join("\n\n");
}

// --------------------------------------------------
// Status API
// --------------------------------------------------

export async function getBodhiStatus(): Promise<string> {
  const result = await bodhiFetch<{
    agent: string;
    bridge: string;
    memory: string;
    notion: string;
    gmail: string;
    calendar: string;
    scheduler: string;
    uptime: number;
    channels: Record<string, string>;
  }>("/api/status");

  if (!result.ok) return result.error;

  const s = result.data;
  const uptime = formatUptime(s.uptime);

  return [
    `BODHI is online (uptime: ${uptime})`,
    "",
    "Services:",
    `  Agent: ${s.agent}`,
    `  Bridge: ${s.bridge}`,
    `  Memory: ${s.memory}`,
    `  Notion: ${s.notion}`,
    `  Gmail: ${s.gmail}`,
    `  Calendar: ${s.calendar}`,
    `  Scheduler: ${s.scheduler}`,
    "",
    "Channels:",
    ...Object.entries(s.channels).map(([k, v]) => `  ${k}: ${v}`),
  ].join("\n");
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
