// ============================================================
// BODHI — Claude Code Bridge
// Remote-controls Claude Code via CLI subprocess
// Routes ALL AI reasoning through Max subscription ($0 cost)
// ============================================================

import { spawn, type ChildProcess } from "node:child_process";
import type { BridgeOptions, BridgeTask, BridgeStatus } from "@seneca/core";

const DEFAULT_OPTIONS: Required<
  Pick<
    BridgeOptions,
    "cwd" | "allowedTools" | "maxTurns" | "maxBudgetUsd" | "permissionMode" | "model"
  >
> = {
  cwd: process.cwd(),
  allowedTools: ["Read", "Edit", "Bash", "Grep", "Glob", "Write"],
  maxTurns: 10,
  maxBudgetUsd: 3,
  permissionMode: "acceptEdits",
  model: "sonnet",
};

export type BridgeProgressCallback = (update: {
  type: "progress" | "result" | "error";
  content: string;
}) => void;

export class Bridge {
  private activeTasks: Map<string, ChildProcess> = new Map();

  /**
   * Execute a Claude Code task via CLI subprocess.
   * Streams progress back via callback.
   *
   * Used for both code tasks (with tools) and chat reasoning (tools disabled).
   */
  async execute(
    prompt: string,
    options: Partial<BridgeOptions>,
    onProgress?: BridgeProgressCallback
  ): Promise<BridgeTask> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const taskId = crypto.randomUUID();

    const task: BridgeTask = {
      id: taskId,
      prompt,
      cwd: opts.cwd,
      allowedTools: opts.allowedTools || [],
      maxTurns: opts.maxTurns || 10,
      maxBudgetUsd: opts.maxBudgetUsd || 0,
      status: "running",
      progress: [],
      startedAt: new Date(),
    };

    onProgress?.({ type: "progress", content: `Starting Claude Code...` });

    try {
      const result = await this.runClaude(prompt, opts, (chunk) => {
        task.progress.push(chunk);
        onProgress?.({ type: "progress", content: chunk });
      });

      task.status = "completed";
      task.result = result;
      task.completedAt = new Date();
      onProgress?.({ type: "result", content: result });
    } catch (error) {
      task.status = "error";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();
      onProgress?.({
        type: "error",
        content: task.error,
      });
    } finally {
      this.activeTasks.delete(taskId);
    }

    return task;
  }

  /**
   * Cancel a running task.
   */
  cancel(taskId: string): boolean {
    const proc = this.activeTasks.get(taskId);
    if (proc) {
      proc.kill("SIGTERM");
      this.activeTasks.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * Check if any tasks are currently running.
   */
  get isRunning(): boolean {
    return this.activeTasks.size > 0;
  }

  private runClaude(
    prompt: string,
    opts: Record<string, any>,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose", // Required for stream-json with -p (print mode)
      ];

      // Permission mode
      if (opts.permissionMode) {
        args.push("--permission-mode", opts.permissionMode);
      }

      // Model (alias like "sonnet"/"opus" or full name)
      if (opts.model) {
        args.push("--model", opts.model);
      }

      // System prompt (for chat mode — injects persona + context)
      if (opts.systemPrompt) {
        args.push("--system-prompt", opts.systemPrompt);
      }

      // Tools: "" disables all, "default" uses all, or specific names
      if (opts.tools !== undefined) {
        args.push("--tools", opts.tools);
      } else if (opts.allowedTools && opts.allowedTools.length > 0) {
        args.push("--allowed-tools", opts.allowedTools.join(" "));
      }

      // Budget cap (only for API key users)
      if (opts.maxBudgetUsd && opts.maxBudgetUsd > 0) {
        args.push("--max-budget-usd", String(opts.maxBudgetUsd));
      }

      // Session management
      if (opts.sessionId) {
        args.push("--session-id", opts.sessionId);
      }

      if (opts.resume) {
        args.push("--resume", opts.resume);
      }

      if (opts.noSessionPersistence) {
        args.push("--no-session-persistence");
      }

      // Strip CLAUDECODE env var to allow spawning Claude Code from within
      // another Claude Code session (e.g., when BODHI is managed by Claude Code)
      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDECODE;

      const proc = spawn("claude", args, {
        cwd: opts.cwd || process.cwd(),
        env: cleanEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Close stdin immediately — claude -p doesn't need stdin input
      // Without this, Claude Code hangs waiting for stdin to close
      proc.stdin.end();

      const taskId = crypto.randomUUID();
      this.activeTasks.set(taskId, proc);

      let fullOutput = "";
      let lastAssistantText = "";

      proc.stdout.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const event = JSON.parse(line);

            if (event.type === "assistant" && event.message) {
              // Extract text content from assistant messages
              const textBlocks = event.message.content?.filter(
                (b: any) => b.type === "text"
              );
              if (textBlocks?.length) {
                const text = textBlocks.map((b: any) => b.text).join("");
                // Emit DELTA (new text only), not full cumulative text
                if (text.length > lastAssistantText.length) {
                  const delta = text.slice(lastAssistantText.length);
                  lastAssistantText = text;
                  onChunk(delta);
                } else if (text !== lastAssistantText) {
                  // Text changed entirely (rare) — emit full text
                  lastAssistantText = text;
                  onChunk(text);
                }
              }
            } else if (event.type === "result") {
              fullOutput = event.result || lastAssistantText;
            }
          } catch {
            // Non-JSON output, accumulate
            fullOutput += line;
          }
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          // Don't forward verbose debug noise to the caller
          if (!text.startsWith("Debug:") && !text.startsWith("Trace:")) {
            onChunk(`[stderr] ${text}`);
          }
        }
      });

      proc.on("close", (code) => {
        this.activeTasks.delete(taskId);
        if (code === 0) {
          resolve(fullOutput || lastAssistantText || "Task completed.");
        } else {
          reject(new Error(`Claude Code exited with code ${code}`));
        }
      });

      proc.on("error", (err) => {
        this.activeTasks.delete(taskId);
        reject(
          new Error(`Failed to start Claude Code: ${err.message}`)
        );
      });
    });
  }
}
