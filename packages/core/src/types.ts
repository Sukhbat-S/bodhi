// ============================================================
// BODHI — Core Type Definitions
// ============================================================

export type Channel = "telegram" | "web" | "cli";

export type MessageRole = "user" | "assistant";

// --- Unified Message Protocol ---

export interface UnifiedMessage {
  id: string;
  channel: Channel;
  channelMessageId: string;
  threadId: string;
  userId: string;
  content: string;
  attachments?: Attachment[];
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface Attachment {
  type: "image" | "file" | "audio";
  url: string;
  name?: string;
  mimeType?: string;
}

// --- Agent Response ---

export interface AgentResponse {
  id: string;
  threadId: string;
  content: string;
  toolCalls?: ToolCallRecord[];
  model: string;
  tokenUsage: TokenUsage;
  durationMs: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: string;
  durationMs: number;
  status: "success" | "error";
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// --- Channel Adapter ---

export interface ChannelAdapter {
  name: Channel;
  send(threadId: string, response: AgentResponse): Promise<void>;
  sendText(threadId: string, text: string): Promise<void>;
  sendStreaming(
    threadId: string,
    onChunk: (emit: (text: string) => Promise<void>) => Promise<void>
  ): Promise<void>;
  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void;
}

// --- Context Engine ---

export interface ContextFragment {
  provider: string;
  content: string;
  tokenEstimate: number;
  relevance: number; // 0-1
}

export interface ContextProvider {
  name: string;
  priority: number;
  gather(message?: string): Promise<ContextFragment>;
  relevance(message: string): number;
}

export interface ContextSnapshot {
  fragments: ContextFragment[];
  totalTokens: number;
  timestamp: Date;
}

// --- Bridge (Claude Code Remote Control) ---

export type BridgeStatus = "idle" | "running" | "completed" | "error";

export interface BridgeTask {
  id: string;
  prompt: string;
  cwd: string;
  allowedTools: string[];
  maxTurns: number;
  maxBudgetUsd: number;
  status: BridgeStatus;
  progress: string[];
  result?: string;
  error?: string;
  sessionId?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface BridgeOptions {
  cwd: string;
  allowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  model?: "opus" | "sonnet";
  // Chat-mode options (for routing reasoning through Claude Code CLI)
  systemPrompt?: string;
  tools?: string; // "" to disable all built-in tools
  sessionId?: string;
  resume?: string;
  noSessionPersistence?: boolean;
  effort?: "low" | "medium" | "high" | "max";
}

// --- AI Backend (abstraction for Agent/Extractor to use Bridge) ---

export interface AIBackend {
  execute(
    prompt: string,
    options: Partial<BridgeOptions>,
    onProgress?: (update: { type: string; content: string }) => void
  ): Promise<BridgeTask>;
}

// --- Agent Config ---

export type ModelId = "claude-opus-4-6" | "claude-sonnet-4-6-20250929" | "claude-sonnet-4-5-20250929";

export interface AgentConfig {
  persona: string;
  model: ModelId;
  maxIterations: number;
  contextBudgetTokens: number;
}

// --- Projects ---

export interface ProjectConfig {
  name: string;
  path: string;
  description?: string;
  defaultBranch?: string;
  allowedTools?: string[];
  maxBudgetUsd?: number;
}
