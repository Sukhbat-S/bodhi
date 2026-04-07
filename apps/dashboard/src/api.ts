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
  github?: string;
  vercel?: string;
  supabase?: string;
  scheduler?: string;
  ownerName?: string;
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
  type?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.search) qs.set("search", params.search);
  if (params?.type) qs.set("type", params.type);
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

export function patchMemory(
  id: string,
  data: { importanceDelta?: number; confidenceDelta?: number }
) {
  return request<{ updated: boolean }>(`/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// --- Memory Quality ---

export interface Insight {
  type: "trend" | "stalled" | "neglected" | "activity";
  text: string;
}

export interface TagTrend {
  tag: string;
  recent: number;
  previous: number;
}

export interface MemoryQuality {
  stale: Memory[];
  neglected: Memory[];
  frequent: Memory[];
  tagTrends: TagTrend[];
  creationRate: { thisWeek: number; lastWeek: number };
}

export function getMemoryInsights() {
  return request<{ insights: Insight[] }>("/memories/insights");
}

export function getMemoryQuality() {
  return request<MemoryQuality>("/memories/quality");
}

// --- Gmail ---

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  labels: string[];
}

export function getGmailStatus() {
  return request<{ connected: boolean; reason?: string }>("/gmail/status");
}

export function getGmailInbox(limit = 20) {
  return request<{ emails: EmailSummary[] }>(`/gmail/inbox?limit=${limit}`);
}

export function getGmailUnread() {
  return request<{ unread: number }>("/gmail/unread");
}

export function searchGmail(q: string) {
  return request<{ emails: EmailSummary[] }>(
    `/gmail/search?q=${encodeURIComponent(q)}`
  );
}

// --- Calendar ---

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees: string[];
  isAllDay: boolean;
  status: string;
  htmlLink?: string;
}

export interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

export function getCalendarStatus() {
  return request<{ connected: boolean; reason?: string }>("/calendar/status");
}

export function getCalendarToday() {
  return request<{ events: CalendarEvent[] }>("/calendar/today");
}

export function getCalendarUpcoming(days = 7) {
  return request<{ events: CalendarEvent[] }>(`/calendar/upcoming?days=${days}`);
}

export function getCalendarFree() {
  return request<{ slots: FreeSlot[] }>("/calendar/free");
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

export interface TurnFeedback {
  rating: "helpful" | "unhelpful";
  text?: string;
  at: string;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedback?: TurnFeedback | null;
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

export function setTurnFeedback(
  threadId: string,
  turnId: string,
  data: { rating: "helpful" | "unhelpful"; text?: string }
) {
  return request<{ updated: boolean }>(
    `/conversations/${threadId}/turns/${turnId}/feedback`,
    { method: "PATCH", body: JSON.stringify(data) }
  );
}

// --- Pending Memories ---

export function getPendingMemories(limit = 20) {
  return request<{ memories: Memory[]; count: number }>(
    `/memories/pending?limit=${limit}`
  );
}

export function getPendingMemoryCount() {
  return request<{ count: number }>("/memories/pending/count");
}

export function confirmMemory(id: string) {
  return request<{ confirmed: boolean }>(`/memories/${id}/confirm`, {
    method: "POST",
  });
}

export function rejectMemory(id: string) {
  return request<{ rejected: boolean }>(`/memories/${id}/reject`, {
    method: "POST",
  });
}

// --- Notion ---

export interface NotionTask {
  id: string;
  title: string;
  status: string | null;
  due: string | null;
  url: string;
}

export interface NotionSession {
  id: string;
  sessionNumber: string;
  focus: string | null;
  status: string | null;
  phase: string | null;
  date: string | null;
  keyDecisions: string | null;
  pendingItems: string | null;
  patternsDiscovered: string | null;
  complexity: string | null;
  deployed: boolean;
  url: string;
}

export function getNotionStatus() {
  return request<{ connected: boolean; databases: { tasks: boolean; sessions: boolean } }>(
    "/notion/status"
  );
}

export function getNotionTasks(filter: "all" | "active" | "todo" = "active") {
  return request<{ tasks: NotionTask[] }>(`/notion/tasks?filter=${filter}`);
}

export function getNotionSessions(limit = 10) {
  return request<{ sessions: NotionSession[] }>(`/notion/sessions?limit=${limit}`);
}

export function searchNotion(q: string) {
  return request<{ results: { title: string; url: string; type: string }[] }>(
    `/notion/search?q=${encodeURIComponent(q)}`
  );
}

// --- GitHub ---

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  repo: string;
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  repo: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  additions: number;
  deletions: number;
  draft: boolean;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  author: string;
  repo: string;
  createdAt: string;
  labels: string[];
  url: string;
}

export function getGitHubStatus() {
  return request<{ connected: boolean; reason?: string; repos?: string[] }>("/github/status");
}

export function getGitHubActivity() {
  return request<{ commits: GitHubCommit[]; prs: GitHubPR[]; issues: GitHubIssue[] }>(
    "/github/activity"
  );
}

export function getGitHubCommits(limit = 20) {
  return request<{ commits: GitHubCommit[] }>(`/github/commits?limit=${limit}`);
}

export function getGitHubPRs() {
  return request<{ prs: GitHubPR[] }>("/github/prs");
}

export function getGitHubIssues(limit = 20) {
  return request<{ issues: GitHubIssue[] }>(`/github/issues?limit=${limit}`);
}

// --- Vercel ---

export interface VercelDeployment {
  id: string;
  name: string;
  url: string;
  state: string;
  createdAt: string;
  readyAt: string | null;
  buildDuration: number | null;
  source: string;
  target: string | null;
  meta: { branch?: string; commitSha?: string; commitMessage?: string } | null;
  inspectorUrl: string;
}

export function getVercelStatus() {
  return request<{ connected: boolean; reason?: string; project?: string }>("/vercel/status");
}

export function getVercelDeployments(limit = 20) {
  return request<{ deployments: VercelDeployment[] }>(`/vercel/deployments?limit=${limit}`);
}

// --- Supabase ---

export interface SupabaseProjectHealth {
  ref: string;
  name: string;
  status: string;
  region: string;
  createdAt: string;
  dbVersion: string;
}

export interface SupabaseTableInfo {
  schema: string;
  name: string;
  rowCount: number;
}

export function getSupabaseStatus() {
  return request<{ connected: boolean; reason?: string }>("/supabase/status");
}

export function getSupabaseHealth() {
  return request<{ health: SupabaseProjectHealth; tables: SupabaseTableInfo[] }>("/supabase/health");
}

// --- Briefings ---

export interface Briefing {
  id: string;
  type: "morning" | "evening" | "weekly";
  content: string;
  createdAt: string;
}

export interface BriefingsResponse {
  briefings: Briefing[];
  limit: number;
  offset: number;
}

export function getBriefings(params?: {
  limit?: number;
  offset?: number;
  type?: "morning" | "evening" | "weekly";
}) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.type) qs.set("type", params.type);
  const query = qs.toString();
  return request<BriefingsResponse>(`/briefings${query ? `?${query}` : ""}`);
}

// --- Push Status ---

export interface PushStatus {
  configured: boolean;
  subscribers: number;
}

export function getPushStatus() {
  return request<PushStatus>("/push/status");
}

// --- Content Engine ---

export interface BuildlogResult {
  tweets: string[];
  summary: string;
}

export function generateBuildlog(params?: { days?: number; topic?: string }) {
  return request<{ buildlog: BuildlogResult; rawData: { commits: number; memories: number } }>(
    "/content/buildlog",
    { method: "POST", body: JSON.stringify(params || {}) }
  );
}

export function generateWeeklyDigest() {
  return request<{ digest: string; stats: { commits: number; memories: number }; tweets: string[] }>(
    "/content/weekly-digest",
    { method: "POST" }
  );
}

// --- Active Sessions ---

export interface ActiveSession {
  id: string;
  project: string;
  description: string;
  currentFile: string | null;
  startedAt: string;
  lastPingAt: string;
}

export function getActiveSessions() {
  return request<{ sessions: ActiveSession[] }>("/sessions/active");
}

export interface SessionMessage {
  id: string;
  fromSession: string;
  toSession: string | null;
  message: string;
  createdAt: string;
}

export function getSessionMessages(since?: string) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return request<{ messages: SessionMessage[] }>(`/sessions/messages${qs}`);
}

export interface FileOwnership {
  session: string;
  project: string;
  file: string;
  since: string;
}

export function getFileOwnerships() {
  return request<{ files: FileOwnership[] }>("/sessions/files");
}

// --- Session SSE Stream ---

export interface SessionStreamCallbacks {
  onInit: (data: { sessions: ActiveSession[]; messages: SessionMessage[]; files: FileOwnership[] }) => void;
  onSessionChange: (event: { type: string; [key: string]: unknown }) => void;
  onMessageSent: (data: { message: SessionMessage }) => void;
  onDisconnect: () => void;
}

export function subscribeSessionStream(callbacks: SessionStreamCallbacks): () => void {
  const source = new EventSource(`${BASE}/sessions/stream`);

  source.addEventListener("init", (e) => {
    try { callbacks.onInit(JSON.parse(e.data)); } catch { /* malformed */ }
  });

  source.addEventListener("session:registered", (e) => {
    try { callbacks.onSessionChange(JSON.parse(e.data)); } catch {}
  });

  source.addEventListener("session:deregistered", (e) => {
    try { callbacks.onSessionChange(JSON.parse(e.data)); } catch {}
  });

  source.addEventListener("session:pinged", (e) => {
    try { callbacks.onSessionChange(JSON.parse(e.data)); } catch {}
  });

  source.addEventListener("message:sent", (e) => {
    try { callbacks.onMessageSent(JSON.parse(e.data)); } catch {}
  });

  source.onerror = () => {
    callbacks.onDisconnect();
  };

  return () => { source.close(); };
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

// --- Workflows ---

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string;
  stepsCount: number;
}

export function getWorkflows() {
  return request<{ workflows: WorkflowInfo[] }>("/workflows");
}

export interface WorkflowProgress {
  workflowId: string;
  runId: string;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  status: "running" | "paused" | "completed" | "failed";
}

export interface WorkflowStepResult {
  stepName: string;
  output: string;
  durationMs: number;
  skipped: boolean;
}

export async function streamWorkflow(
  workflowId: string,
  onStart: (data: { steps: string[]; totalSteps: number }) => void,
  onProgress: (progress: WorkflowProgress) => void,
  onStepDone: (step: WorkflowStepResult) => void,
  onDone: (result: { status: string; totalDurationMs: number; error?: string }) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/workflows/${workflowId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw new Error(`Workflow failed: ${res.statusText}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

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
          if (event.type === "start") onStart(event);
          else if (event.type === "progress") onProgress(event);
          else if (event.type === "step_complete") onStepDone(event);
          else if (event.type === "done") onDone(event);
        } catch { /* skip */ }
      }
    }
  }
}
