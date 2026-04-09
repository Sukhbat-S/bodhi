// ============================================================
// The Hive — Agent SDK Backend
// Uses Claude Code as a library instead of spawning CLI processes.
// ~20-30MB per agent vs ~120MB for CLI subprocess.
// ============================================================

import type { BackendType } from "./types.js";

// Dynamic import to avoid hard dependency — SDK may not be installed in all environments
let queryFn: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null;

async function loadSDK(): Promise<typeof import("@anthropic-ai/claude-agent-sdk").query> {
  if (!queryFn) {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    queryFn = sdk.query;
  }
  return queryFn;
}

export interface SDKBackendOptions {
  model?: string;
  cwd?: string;
  allowedTools?: string[];
  maxTurns?: number;
  systemPrompt?: string;
}

/**
 * Execute a task via the Agent SDK (in-process, no CLI subprocess).
 * Returns the final result string.
 */
export async function executeViaSDK(
  prompt: string,
  options: SDKBackendOptions = {},
): Promise<{ content: string; durationMs: number; costUsd: number }> {
  const query = await loadSDK();

  const sdkOptions: Record<string, unknown> = {
    model: options.model || "opus",
    cwd: options.cwd || process.cwd(),
    maxTurns: options.maxTurns || 25,
    allowedTools: options.allowedTools || ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    permissionMode: "acceptEdits" as const,
  };

  if (options.systemPrompt) {
    sdkOptions.systemPrompt = options.systemPrompt;
  }

  const stream = query({ prompt, options: sdkOptions as any });

  let finalResult = "";
  let durationMs = 0;
  let costUsd = 0;

  for await (const message of stream) {
    if (message.type === "result") {
      const result = message as { subtype: string; result: string; duration_ms: number; total_cost_usd: number };
      if (result.subtype === "success") {
        finalResult = result.result;
        durationMs = result.duration_ms;
        costUsd = result.total_cost_usd;
      } else {
        throw new Error(`SDK query failed: ${result.result}`);
      }
    }
    // Stream events (assistant messages, tool use) — skip for now
    // Could wire to onProgress callback later
  }

  return { content: finalResult, durationMs, costUsd };
}

/**
 * Create an SDK backend compatible with AgentPool's backend interface.
 */
export function createSDKBackend(): { execute: (prompt: string, options?: Record<string, unknown>) => Promise<{ content: string }> } {
  return {
    async execute(prompt: string, options?: Record<string, unknown>) {
      const result = await executeViaSDK(prompt, {
        model: options?.model as string,
        cwd: options?.cwd as string,
        allowedTools: options?.allowedTools as string[],
        systemPrompt: options?.systemPrompt as string,
      });
      return { content: result.content };
    },
  };
}

export const BACKEND_TYPE: BackendType = "sdk";
