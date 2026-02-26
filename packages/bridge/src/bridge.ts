// ============================================================
// SENECA — Claude Code Bridge
// Remote-controls Claude Code via CLI subprocess
// ============================================================

import { spawn, type ChildProcess } from "node:child_process";
import type { BridgeOptions, BridgeTask, BridgeStatus } from "@seneca/core";

const DEFAULT_OPTIONS: Required<BridgeOptions> = {
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
      allowedTools: opts.allowedTools,
      maxTurns: opts.maxTurns,
      maxBudgetUsd: opts.maxBudgetUsd,
      status: "running",
      progress: [],
      startedAt: new Date(),
    };

    onProgress?.({ type: "progress", content: `Starting Claude Code in ${opts.cwd}...` });

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
    opts: Required<BridgeOptions>,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--cwd",
        opts.cwd,
        "--max-turns",
        String(opts.maxTurns),
        "--permission-mode",
        opts.permissionMode,
        "--model",
        opts.model,
      ];

      // Add allowed tools
      if (opts.allowedTools.length > 0) {
        args.push("--allowedTools", opts.allowedTools.join(","));
      }

      // Add budget cap
      if (opts.maxBudgetUsd > 0) {
        args.push("--max-budget-usd", String(opts.maxBudgetUsd));
      }

      const proc = spawn("claude", args, {
        cwd: opts.cwd,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

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
                if (text !== lastAssistantText) {
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
          onChunk(`[stderr] ${text}`);
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
