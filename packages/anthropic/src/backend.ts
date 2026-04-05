// ============================================================
// BODHI — Anthropic API Backend
// Implements AIBackend using @anthropic-ai/sdk directly.
// Drop-in replacement for Bridge when Claude Code CLI is unavailable.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AIBackend, BridgeTask, BridgeOptions } from "@seneca/core";

const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-20250514",
  sonnet: "claude-sonnet-4-5-20250514",
};

export class AnthropicBackend implements AIBackend {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, model: string = "sonnet") {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = MODEL_MAP[model] || MODEL_MAP.sonnet;
  }

  async execute(
    prompt: string,
    options: Partial<BridgeOptions>,
    onProgress?: (update: { type: string; content: string }) => void
  ): Promise<BridgeTask> {
    const taskId = crypto.randomUUID();
    const model = options.model
      ? MODEL_MAP[options.model] || this.defaultModel
      : this.defaultModel;

    const task: BridgeTask = {
      id: taskId,
      prompt,
      cwd: options.cwd || process.cwd(),
      allowedTools: [],
      maxTurns: 1,
      maxBudgetUsd: 0,
      status: "running",
      progress: [],
      startedAt: new Date(),
    };

    onProgress?.({ type: "progress", content: "Calling Anthropic API..." });

    try {
      // Parse system prompt from the full prompt if present
      const { system, userMessage } = this.parsePrompt(prompt);

      if (onProgress) {
        // Streaming mode
        const fullText = await this.streamResponse(model, system, userMessage, onProgress);
        task.status = "completed";
        task.result = fullText;
      } else {
        // Non-streaming mode
        const response = await this.client.messages.create({
          model,
          max_tokens: 4096,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: userMessage }],
        });

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

        task.status = "completed";
        task.result = text;
      }

      task.completedAt = new Date();
      onProgress?.({ type: "result", content: task.result || "" });
    } catch (error) {
      task.status = "error";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();
      onProgress?.({ type: "error", content: task.error });
    }

    return task;
  }

  private async streamResponse(
    model: string,
    system: string | undefined,
    userMessage: string,
    onProgress: (update: { type: string; content: string }) => void
  ): Promise<string> {
    const stream = this.client.messages.stream({
      model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: userMessage }],
    });

    let fullText = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullText += event.delta.text;
        onProgress({ type: "progress", content: event.delta.text });
      }
    }

    return fullText;
  }

  /**
   * Parse BODHI's prompt format to extract system prompt and user message.
   * Agent builds prompts as: <system>...</system>\n\n[history]\n\nuser message
   */
  private parsePrompt(prompt: string): { system: string | undefined; userMessage: string } {
    const systemMatch = prompt.match(/<system>([\s\S]*?)<\/system>/);
    if (systemMatch) {
      const system = systemMatch[1].trim();
      const userMessage = prompt.slice(systemMatch[0].length).trim();
      return { system, userMessage };
    }
    return { system: undefined, userMessage: prompt };
  }
}
