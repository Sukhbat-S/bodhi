// ============================================================
// BODHI — Agent Core
// Routes reasoning through Claude Code CLI (Bridge) via AIBackend
// Uses Max subscription — $0 cost per message
// ============================================================

import type {
  AgentConfig,
  AgentResponse,
  AIBackend,
  ContextSnapshot,
  ModelId,
  TokenUsage,
} from "./types.js";

const DEFAULT_CONFIG: AgentConfig = {
  persona: "",
  model: "claude-sonnet-4-5-20250929",
  maxIterations: 10,
  contextBudgetTokens: 2000,
};

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export class Agent {
  private backend: AIBackend;
  private config: AgentConfig;
  private conversationHistory: ConversationMessage[] = [];

  constructor(
    config: Partial<AgentConfig> & { persona: string },
    backend: AIBackend
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.backend = backend;
  }

  async chat(
    userMessage: string,
    context?: ContextSnapshot,
    history?: ConversationMessage[]
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // If external history provided, use it; otherwise use internal accumulation
    if (!history) {
      this.conversationHistory.push({ role: "user", content: userMessage });
    }

    const fullPrompt = this.buildFullPrompt(userMessage, context, history);

    console.log("[agent] Sending chat to Bridge...");

    const task = await this.backend.execute(fullPrompt, {
      model: this.config.model.includes("opus") ? "opus" : "sonnet",
      // Coworker mode: full tool access (Read, Edit, Bash, Grep, Glob, Write)
      // Bridge defaults apply — no tool restriction
      noSessionPersistence: true,
    });

    console.log(`[agent] Bridge returned: status=${task.status}, result length=${task.result?.length || 0}, error=${task.error || "none"}`);

    // Use result, or error message, or fallback
    const assistantContent = task.result || task.error || "I couldn't generate a response.";

    if (!history) {
      this.conversationHistory.push({
        role: "assistant",
        content: assistantContent,
      });

      if (this.conversationHistory.length > 40) {
        this.conversationHistory = this.conversationHistory.slice(-40);
      }
    }

    return {
      id: task.id,
      threadId: "",
      content: assistantContent,
      model: this.config.model,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startTime,
    };
  }

  async stream(
    userMessage: string,
    context?: ContextSnapshot,
    onChunk?: (text: string) => void,
    history?: ConversationMessage[],
    imagePath?: string
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!history) {
      this.conversationHistory.push({ role: "user", content: userMessage });
    }

    const fullPrompt = this.buildFullPrompt(userMessage, context, history, imagePath);

    console.log(`[agent] Sending stream to Bridge...${imagePath ? ` (with image: ${imagePath})` : ""}`);

    const task = await this.backend.execute(
      fullPrompt,
      {
        model: this.config.model.includes("opus") ? "opus" : "sonnet",
        // Coworker mode: full tool access (Read, Edit, Bash, Grep, Glob, Write)
        // Bridge defaults apply — no tool restriction
        noSessionPersistence: true,
      },
      (update) => {
        if (update.type === "progress" && onChunk) {
          onChunk(update.content);
        }
      }
    );

    console.log(`[agent] Bridge returned: status=${task.status}, result length=${task.result?.length || 0}, error=${task.error || "none"}`);

    // Use result, or error message, or fallback
    const fullText = task.result || task.error || "I couldn't generate a response.";

    if (!history) {
      this.conversationHistory.push({ role: "assistant", content: fullText });

      if (this.conversationHistory.length > 40) {
        this.conversationHistory = this.conversationHistory.slice(-40);
      }
    }

    return {
      id: task.id,
      threadId: "",
      content: fullText,
      model: this.config.model,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startTime,
    };
  }

  setModel(model: ModelId) {
    this.config.model = model;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Build the full prompt with persona, context, history, and user message
   * all embedded directly in the -p prompt. This is the most robust approach
   * since it doesn't rely on --system-prompt or --tools flags.
   */
  private buildFullPrompt(
    userMessage: string,
    context?: ContextSnapshot,
    history?: ConversationMessage[],
    imagePath?: string
  ): string {
    let prompt = "<system>\n";
    prompt += this.config.persona;

    if (context && context.fragments.length > 0) {
      prompt += "\n\n---\n\n## Current Context\n\n";
      prompt += "**Important:** The context below contains your memories from past conversations and live data from connected services. Actively reference this information when responding — don't ask questions you already have answers to. If memories are relevant, use them naturally in your response.\n\n";
      for (const fragment of context.fragments) {
        prompt += `### ${fragment.provider}\n${fragment.content}\n\n`;
      }
    }

    if (imagePath) {
      prompt += `\n\nThe user sent an image. Use the Read tool to view the file at "${imagePath}", then respond about what you see.\n`;
    }

    prompt += `\n\nYou are BODHI, Sukhbat's AI coworker. You have full tool access: Read, Edit, Write, Bash, Grep, Glob. Use them whenever a task requires it — read files, edit code, run commands, search the codebase. Act like a capable teammate: if asked to fix a bug, actually fix it. If asked about code, read it first. Be direct and get things done. For purely conversational messages, just respond with text — no need to use tools for simple questions.\n`;
    prompt += `\nWorking directory: ${process.cwd()}\n`;
    prompt += "</system>\n\n";

    // Use external history if provided, otherwise use internal (minus the latest user message)
    const historyMessages = history ?? this.conversationHistory.slice(0, -1);
    if (historyMessages.length > 0) {
      prompt += "<conversation_history>\n";
      for (const msg of historyMessages) {
        prompt += `<${msg.role}>${msg.content}</${msg.role}>\n`;
      }
      prompt += "</conversation_history>\n\n";
    }

    prompt += userMessage;

    return prompt;
  }
}
