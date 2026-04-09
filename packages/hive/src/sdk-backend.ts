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
    // Tighter default — most tasks finish in 5-8 turns. 25 was wasteful default.
    maxTurns: options.maxTurns || 8,
    // No default tools — pass exactly what the role needs, nothing extra.
    // Smaller tool surface = faster agent decisions = lower latency.
    allowedTools: options.allowedTools || [],
    permissionMode: "acceptEdits" as const,
  };

  if (options.systemPrompt) {
    sdkOptions.systemPrompt = options.systemPrompt;
  }

  const stream = query({ prompt, options: sdkOptions as any });

  let finalResult = "";
  let durationMs = 0;
  let costUsd = 0;
  let turnCount = 0;
  const startTime = Date.now();

  try {
    for await (const message of stream) {
      // Count turns for visibility
      if (message.type === "assistant") {
        turnCount++;
      }

      if (message.type === "result") {
        const result = message as Record<string, unknown>;
        if (result.subtype === "success") {
          finalResult = String(result.result || "");
          durationMs = Number(result.duration_ms || 0);
          costUsd = Number(result.total_cost_usd || 0);
        } else {
          // Capture EVERY field — error message could be in result, error, message, or stop_reason
          const errorMsg = String(
            result.result ||
            result.error ||
            result.message ||
            result.stop_reason ||
            JSON.stringify(result).slice(0, 500) ||
            "unknown SDK error"
          );
          throw new Error(`SDK query failed (subtype=${result.subtype}): ${errorMsg}`);
        }
      }
    }
  } catch (err: unknown) {
    // Surface the actual error, not "undefined"
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "undefined" || !msg) {
      throw new Error(`SDK stream error (no message): ${JSON.stringify(err).slice(0, 300)}`);
    }
    throw err;
  }

  // Log latency to find slow tasks
  const wallMs = Date.now() - startTime;
  if (wallMs > 60_000) {
    console.warn(`[hive-sdk] Slow task: ${(wallMs / 1000).toFixed(1)}s, ${turnCount} turns`);
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
