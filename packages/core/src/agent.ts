// ============================================================
// SENECA — Agent Core
// Wraps Anthropic SDK for SENECA's own reasoning (non-code tasks)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentConfig,
  AgentResponse,
  ContextSnapshot,
  ModelId,
  TokenUsage,
  ToolCallRecord,
} from "./types.js";

const DEFAULT_CONFIG: AgentConfig = {
  persona: "",
  model: "claude-sonnet-4-5-20250929",
  maxIterations: 10,
  contextBudgetTokens: 2000,
};

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export class Agent {
  private client: Anthropic;
  private config: AgentConfig;
  private conversationHistory: ConversationMessage[] = [];

  constructor(config: Partial<AgentConfig> & { persona: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = new Anthropic();
  }

  async chat(
    userMessage: string,
    context?: ContextSnapshot
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    this.conversationHistory.push({ role: "user", content: userMessage });

    const systemPrompt = this.buildSystemPrompt(context);

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    const assistantContent =
      response.content[0].type === "text" ? response.content[0].text : "";

    this.conversationHistory.push({
      role: "assistant",
      content: assistantContent,
    });

    // Keep conversation window manageable (last 40 messages)
    if (this.conversationHistory.length > 40) {
      this.conversationHistory = this.conversationHistory.slice(-40);
    }

    const tokenUsage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens:
        "cache_read_input_tokens" in response.usage
          ? (response.usage.cache_read_input_tokens as number)
          : undefined,
      cacheWriteTokens:
        "cache_creation_input_tokens" in response.usage
          ? (response.usage.cache_creation_input_tokens as number)
          : undefined,
    };

    return {
      id: response.id,
      threadId: "",
      content: assistantContent,
      model: this.config.model,
      tokenUsage,
      durationMs: Date.now() - startTime,
    };
  }

  async stream(
    userMessage: string,
    context?: ContextSnapshot,
    onChunk?: (text: string) => void
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    this.conversationHistory.push({ role: "user", content: userMessage });

    const systemPrompt = this.buildSystemPrompt(context);

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    let fullText = "";

    stream.on("text", (text) => {
      fullText += text;
      onChunk?.(text);
    });

    const finalMessage = await stream.finalMessage();

    this.conversationHistory.push({ role: "assistant", content: fullText });

    if (this.conversationHistory.length > 40) {
      this.conversationHistory = this.conversationHistory.slice(-40);
    }

    const tokenUsage: TokenUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };

    return {
      id: finalMessage.id,
      threadId: "",
      content: fullText,
      model: this.config.model,
      tokenUsage,
      durationMs: Date.now() - startTime,
    };
  }

  setModel(model: ModelId) {
    this.config.model = model;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  private buildSystemPrompt(context?: ContextSnapshot): string {
    let prompt = this.config.persona;

    if (context && context.fragments.length > 0) {
      prompt += "\n\n---\n\n## Current Context\n\n";
      for (const fragment of context.fragments) {
        prompt += `### ${fragment.provider}\n${fragment.content}\n\n`;
      }
    }

    return prompt;
  }
}
