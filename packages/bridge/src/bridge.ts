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
  maxBudgetUsd: 0,
  permissionMode: "acceptEdits",
  model: "sonnet",
};

export type BridgeProgressCallback = (update: {
  type: "progress" | "result" | "error";
  content: string;
}) => void;

export class Bridge {
  private activeTasks: Map<string, ChildProcess> = new Map();
  private cleanEnv: NodeJS.ProcessEnv;

  constructor() {
    // Strip env vars that interfere with Claude CLI auth — ONCE, not per call.
    // ANTHROPIC_API_KEY: forces API key auth, bypassing Max subscription.
    // CLAUDE_*: parent session vars that cause nested-session exit code 1.
    this.cleanEnv = { ...process.env };
    const stripped: string[] = [];
    for (const key of Object.keys(this.cleanEnv)) {
      if (
        key === "CLAUDECODE" ||
        key === "ANTHROPIC_API_KEY" ||
        key.startsWith("CLAUDE_") ||
        (key === "__CFBundleIdentifier" && this.cleanEnv[key]?.includes("claude"))
      ) {
        stripped.push(key);
        delete this.cleanEnv[key];
      }
    }
    if (stripped.length > 0) {
      console.log(`[bridge] Env cleaned once: stripped ${stripped.length} vars (${stripped.join(", ")})`);
    }
  }

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
      // Pass prompt via stdin instead of as a -p argument.
      // The CLI arg approach breaks with large prompts containing
      // XML-like tags, markdown tables, pipes, and special chars.
      // `-p` without a value reads from stdin ("useful for pipes").
      const args: string[] = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
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
      if (opts.tools !== undefined && opts.tools !== "") {
        args.push("--tools", opts.tools);
      } else if (opts.tools !== "" && opts.allowedTools && opts.allowedTools.length > 0) {
        args.push("--allowed-tools", opts.allowedTools.join(" "));
      }
      // When tools === "", we skip --tools entirely; the prompt instructs no tool use

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

      if (opts.effort) {
        args.push("--effort", opts.effort);
      }

      // Use pre-cleaned env (stripped once at class init, not per call)
      const cleanEnv = this.cleanEnv;

      console.log(`[bridge] Running: claude ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")} (prompt via stdin, ${prompt.length} chars)`);

      const proc = spawn("claude", args, {
        cwd: opts.cwd || process.cwd(),
        env: cleanEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Pipe prompt via stdin then close — keeps the arg list small
      // and avoids issues with special characters in the prompt text
      proc.stdin.write(prompt);
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

      let stderrBuffer = "";
      proc.stderr.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          stderrBuffer += text + "\n";
          // Don't forward verbose debug noise to the caller
          if (!text.startsWith("Debug:") && !text.startsWith("Trace:")) {
            console.error(`[bridge/stderr] ${text}`);
            onChunk(`[stderr] ${text}`);
          }
        }
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[bridge] Exited with code ${code}. stderr: ${stderrBuffer || "(empty)"} stdout: ${(fullOutput || lastAssistantText).slice(0, 200) || "(empty)"}`);
        }
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
