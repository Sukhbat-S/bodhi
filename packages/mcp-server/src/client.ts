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
      const content = m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content;
      return `${i + 1}. [${m.type}] ${content} (${sim}% match, ${date})${tags}`;
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
// Session Summary (batch store)
// --------------------------------------------------

export async function storeSessionSummary(input: {
  project: string;
  completed: string[];
  pending: string[];
  memories: Array<{
    content: string;
    type: string;
    importance: number;
    tags?: string[];
  }>;
  sessionNote?: string;
}): Promise<string> {
  const { project, completed, pending, memories, sessionNote } = input;

  // Build session summary event
  const summaryParts = [`Session summary (${project})`];
  if (completed.length > 0)
    summaryParts.push(`Completed: ${completed.join("; ")}`);
  if (pending.length > 0)
    summaryParts.push(`Pending: ${pending.join("; ")}`);
  if (sessionNote) summaryParts.push(sessionNote);

  const today = new Date().toISOString().slice(0, 10);
  const allMemories = [
    ...memories.map((m) => ({
      ...m,
      tags: [...(m.tags || []), project],
    })),
    {
      content: summaryParts.join(". "),
      type: "event",
      importance: 0.8,
      tags: [project, "session-summary", today],
    },
  ];

  const result = await bodhiFetch<{ stored: number; ids: string[] }>(
    "/api/memories/batch",
    {
      method: "POST",
      body: JSON.stringify({ memories: allMemories }),
    },
  );

  if (!result.ok) return result.error;

  const typeCount = allMemories.reduce(
    (acc, m) => {
      acc[m.type] = (acc[m.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const breakdown = Object.entries(typeCount)
    .map(([t, c]) => `${c} ${t}${c > 1 ? "s" : ""}`)
    .join(", ");

  return `Session saved: ${result.data.stored} memories stored (${breakdown}). BODHI will remember this session.`;
}

// --------------------------------------------------
// Project Context (filtered by tag)
// --------------------------------------------------

export async function getProjectContext(
  project: string,
  limit = 10,
): Promise<string> {
  const result = await bodhiFetch<{
    memories: Array<{
      id: string;
      content: string;
      type: string;
      importance: number;
      createdAt: string;
      tags: string[] | null;
    }>;
    total: number;
  }>(`/api/memories?tag=${encodeURIComponent(project)}&limit=${limit}`);

  if (!result.ok) return result.error;

  const { memories, total } = result.data;
  if (memories.length === 0) {
    return `No memories found tagged with "${project}".`;
  }

  const grouped: Record<string, string[]> = {};
  for (const m of memories) {
    const type = m.type || "fact";
    if (!grouped[type]) grouped[type] = [];
    const date = new Date(m.createdAt).toLocaleDateString();
    const content = m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
    grouped[type].push(`- ${content} (${date})`);
  }

  const sections = Object.entries(grouped).map(
    ([type, items]) =>
      `## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${items.length})\n${items.join("\n")}`,
  );

  return [
    `Project "${project}" — ${total} memories (showing ${memories.length}):`,
    "",
    ...sections,
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

  // Fetch turns for the most recent thread only (to keep output manageable)
  const detailed = await Promise.all(
    threads.slice(0, 1).map(async (thread) => {
      const turnsResult = await bodhiFetch<{
        thread: Thread;
        turns: Turn[];
      }>(`/api/conversations/${thread.id}`);

      if (!turnsResult.ok) {
        return `## ${thread.title || "Untitled"} (${thread.channel})\n  (failed to load turns)`;
      }

      const turns = turnsResult.data.turns.slice(-2); // Last 2 turns
      const turnLines = turns
        .map((t) => {
          const preview =
            t.content.length > 100
              ? t.content.slice(0, 100) + "..."
              : t.content;
          return `  ${t.role}: ${preview}`;
        })
        .join("\n");

      const ago = timeAgo(new Date(thread.lastActiveAt));
      return `## ${thread.title || "Untitled"} (${thread.channel}, ${ago})\n${turnLines}`;
    }),
  );

  // Add summary for remaining threads
  const remaining = threads.slice(1).map((t) => {
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
// Briefing & Synthesis APIs
// --------------------------------------------------

export async function getBriefing(
  type: "morning" | "evening" | "weekly",
): Promise<string> {
  const result = await bodhiFetch<{
    briefing?: string;
    content?: string;
    message?: string;
    error?: string;
  }>("/api/scheduler/trigger", {
    method: "POST",
    body: JSON.stringify({ type }),
  });

  if (!result.ok) return result.error;
  return result.data.briefing || result.data.content || result.data.message || JSON.stringify(result.data);
}

export async function runMemorySynthesis(): Promise<string> {
  const result = await bodhiFetch<{
    message?: string;
    deduped?: number;
    synthesized?: number;
    decayed?: number;
    promoted?: number;
    durationMs?: number;
  }>("/api/scheduler/trigger", {
    method: "POST",
    body: JSON.stringify({ type: "synthesis" }),
  });

  if (!result.ok) return result.error;

  const d = result.data;
  if (d.message) return d.message;
  return [
    "Memory synthesis complete:",
    d.deduped != null ? `  Deduplicated: ${d.deduped}` : null,
    d.synthesized != null ? `  Synthesized: ${d.synthesized}` : null,
    d.decayed != null ? `  Decayed: ${d.decayed}` : null,
    d.promoted != null ? `  Promoted: ${d.promoted}` : null,
    d.durationMs != null ? `  Duration: ${d.durationMs}ms` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function getInsights(): Promise<string> {
  const result = await bodhiFetch<{
    insights: {
      tagTrends?: Array<{ tag: string; count: number; trend: string }>;
      stalledDecisions?: Array<{ content: string; createdAt: string }>;
      neglectedHighValue?: Array<{ content: string; importance: number }>;
      activityRate?: { thisWeek: number; lastWeek: number };
    };
  }>("/api/memories/insights");

  if (!result.ok) return result.error;

  const { insights } = result.data;
  const sections: string[] = [];

  if (insights.tagTrends?.length) {
    sections.push(
      "Tag trends (7d):\n" +
        insights.tagTrends
          .slice(0, 10)
          .map((t) => `  ${t.tag}: ${t.count} (${t.trend})`)
          .join("\n"),
    );
  }

  if (insights.stalledDecisions?.length) {
    sections.push(
      "Stalled decisions:\n" +
        insights.stalledDecisions
          .map((d) => `  - ${d.content} (${new Date(d.createdAt).toLocaleDateString()})`)
          .join("\n"),
    );
  }

  if (insights.neglectedHighValue?.length) {
    sections.push(
      "Neglected high-value memories:\n" +
        insights.neglectedHighValue
          .map((m) => `  - ${m.content} (importance: ${m.importance})`)
          .join("\n"),
    );
  }

  if (insights.activityRate) {
    sections.push(
      `Activity: ${insights.activityRate.thisWeek} memories this week vs ${insights.activityRate.lastWeek} last week`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "No insights available.";
}

export async function extractMemories(
  userMessage: string,
  assistantResponse: string,
): Promise<string> {
  const result = await bodhiFetch<{
    extracted: boolean;
    message: string;
  }>("/api/memories/extract", {
    method: "POST",
    body: JSON.stringify({ userMessage, assistantResponse }),
  });

  if (!result.ok) return result.error;
  return result.data.message;
}

// --------------------------------------------------
// Content Generation
// --------------------------------------------------

export async function generateBuildLog(
  days = 7,
  topic = "",
): Promise<string> {
  const result = await bodhiFetch<{
    buildlog: { tweets: string[]; summary: string };
    rawData: { commits: number; memories: number };
  }>("/api/content/buildlog", {
    method: "POST",
    body: JSON.stringify({ days, topic }),
  });

  if (!result.ok) return result.error;

  const { buildlog, rawData } = result.data;
  const tweets = buildlog.tweets.map((t, i) => `[Tweet ${i + 1}] ${t}`).join("\n\n");
  return [
    `Build Log (${rawData.commits} commits, ${rawData.memories} memories):`,
    "",
    tweets,
    "",
    `Summary: ${buildlog.summary}`,
  ].join("\n");
}

export async function generateWeeklyDigest(): Promise<string> {
  const result = await bodhiFetch<{
    digest: string;
    stats: { commits: number; memories: number };
    tweets: string[];
  }>("/api/content/weekly-digest", {
    method: "POST",
  });

  if (!result.ok) return result.error;

  const { digest, stats, tweets } = result.data;
  return [
    `Weekly Digest (${stats.commits} commits, ${stats.memories} memories):`,
    "",
    digest,
    "",
    tweets.length > 0 ? `Tweet-ready:\n${tweets.map((t, i) => `[${i + 1}] ${t}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
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

// ============================================================
// Workflows
// ============================================================

export async function getWorkflows(): Promise<string> {
  const result = await bodhiFetch<{
    workflows: { id: string; name: string; description: string; stepsCount: number }[];
  }>("/api/workflows");

  if (!result.ok) return result.error;

  const wfs = result.data.workflows;
  if (wfs.length === 0) return "No workflows registered.";

  const lines = wfs.map(
    (w) => `- **${w.name}** (\`${w.id}\`): ${w.description} (${w.stepsCount} steps)`
  );
  return `Available workflows:\n\n${lines.join("\n")}`;
}

export async function triggerWorkflow(workflowId: string): Promise<string> {
  const result = await bodhiFetch<{
    status: string;
    content?: string;
    error?: string;
  }>(`/api/workflows/${workflowId}/run`, { method: "POST" });

  if (!result.ok) return result.error;

  const d = result.data;
  if (d.status === "error" || d.status === "failed") {
    return `Workflow "${workflowId}" failed: ${d.error || "Unknown error"}`;
  }
  return `Workflow "${workflowId}" ${d.status}. ${d.content || ""}`;
}
