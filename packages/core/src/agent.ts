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
import type {
  WorkflowDefinition,
  WorkflowResult,
  WorkflowProgress,
  WorkflowProgressCallback,
  StepOutput,
} from "./workflow.js";

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

  /**
   * Run a multi-step workflow, passing each step's output as context to the next.
   * The 1M token context window IS the state machine.
   */
  async runWorkflow(
    definition: WorkflowDefinition,
    context?: ContextSnapshot,
    onProgress?: WorkflowProgressCallback,
    resumeFromStep = 0,
    previousOutputs: StepOutput[] = []
  ): Promise<WorkflowResult> {
    const runId = crypto.randomUUID();
    const startTime = Date.now();
    const outputs: StepOutput[] = [...previousOutputs];

    console.log(`[agent] Starting workflow "${definition.id}" (${definition.steps.length} steps, resume from ${resumeFromStep})`);

    for (let i = resumeFromStep; i < definition.steps.length; i++) {
      const step = definition.steps[i];

      // Report progress
      onProgress?.({
        workflowId: definition.id,
        runId,
        currentStep: i,
        totalSteps: definition.steps.length,
        stepName: step.name,
        status: "running",
      });

      // Check if step should be skipped
      if (step.shouldRun && !step.shouldRun(outputs)) {
        console.log(`[agent] Skipping step "${step.name}" (shouldRun returned false)`);
        outputs.push({
          stepName: step.name,
          output: "",
          durationMs: 0,
          skipped: true,
        });
        continue;
      }

      // Check if approval is required before this step
      if (step.requiresApproval && i > resumeFromStep) {
        console.log(`[agent] Workflow paused at step "${step.name}" — requires approval`);
        onProgress?.({
          workflowId: definition.id,
          runId,
          currentStep: i,
          totalSteps: definition.steps.length,
          stepName: step.name,
          status: "paused",
        });
        return {
          runId,
          workflowId: definition.id,
          status: "paused",
          steps: outputs,
          totalDurationMs: Date.now() - startTime,
          pauseReason: `Approval required before step: ${step.name}`,
          resumeFromStep: i,
        };
      }

      // Build the step prompt
      const promptText =
        typeof step.prompt === "function" ? step.prompt(outputs) : step.prompt;

      // Build workflow context from previous steps
      let workflowContext = `<workflow>\n`;
      workflowContext += `<workflow_name>${definition.name}</workflow_name>\n`;
      workflowContext += `<current_step>${i + 1} of ${definition.steps.length}: ${step.name}</current_step>\n`;
      if (outputs.length > 0) {
        workflowContext += `<previous_steps>\n`;
        for (const prev of outputs) {
          if (!prev.skipped) {
            workflowContext += `<step name="${prev.stepName}">\n${prev.output}\n</step>\n`;
          }
        }
        workflowContext += `</previous_steps>\n`;
      }
      workflowContext += `</workflow>\n\n`;

      const fullPrompt = workflowContext + promptText;

      // Override model if step specifies one
      const originalModel = this.config.model;
      if (step.model) {
        this.config.model = step.model === "opus"
          ? "claude-opus-4-6"
          : "claude-sonnet-4-5-20250929";
      }

      const stepStart = Date.now();
      try {
        const response = await this.chat(fullPrompt, context);
        outputs.push({
          stepName: step.name,
          output: response.content,
          durationMs: Date.now() - stepStart,
          skipped: false,
        });
        console.log(`[agent] Step "${step.name}" completed (${((Date.now() - stepStart) / 1000).toFixed(1)}s)`);
      } catch (error) {
        console.error(`[agent] Step "${step.name}" failed:`, error);
        outputs.push({
          stepName: step.name,
          output: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - stepStart,
          skipped: false,
        });

        // Restore model and return failure
        this.config.model = originalModel;
        onProgress?.({
          workflowId: definition.id,
          runId,
          currentStep: i,
          totalSteps: definition.steps.length,
          stepName: step.name,
          status: "failed",
        });
        return {
          runId,
          workflowId: definition.id,
          status: "failed",
          steps: outputs,
          totalDurationMs: Date.now() - startTime,
          error: `Step "${step.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      // Restore model
      this.config.model = originalModel;

      // Check onStepComplete callback
      if (definition.onStepComplete) {
        const decision = definition.onStepComplete(i, outputs[outputs.length - 1], outputs);
        if (decision === "pause") {
          onProgress?.({
            workflowId: definition.id,
            runId,
            currentStep: i + 1,
            totalSteps: definition.steps.length,
            stepName: step.name,
            status: "paused",
          });
          return {
            runId,
            workflowId: definition.id,
            status: "paused",
            steps: outputs,
            totalDurationMs: Date.now() - startTime,
            pauseReason: `Paused after step: ${step.name}`,
            resumeFromStep: i + 1,
          };
        }
        if (decision === "abort") {
          return {
            runId,
            workflowId: definition.id,
            status: "failed",
            steps: outputs,
            totalDurationMs: Date.now() - startTime,
            error: `Aborted after step: ${step.name}`,
          };
        }
      }
    }

    onProgress?.({
      workflowId: definition.id,
      runId,
      currentStep: definition.steps.length,
      totalSteps: definition.steps.length,
      stepName: "done",
      status: "completed",
    });

    console.log(`[agent] Workflow "${definition.id}" completed (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    return {
      runId,
      workflowId: definition.id,
      status: "completed",
      steps: outputs,
      totalDurationMs: Date.now() - startTime,
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
