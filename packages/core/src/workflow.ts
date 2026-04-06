// ============================================================
// BODHI — Workflow Engine
// Multi-step agent workflows leveraging 1M token context
// ============================================================

export interface WorkflowStep {
  name: string;
  prompt: string | ((previousOutputs: StepOutput[]) => string);
  /** Skip this step based on previous results */
  shouldRun?: (previousOutputs: StepOutput[]) => boolean;
  /** Override model for this step */
  model?: "opus" | "sonnet";
  /** Max duration for this step in ms (default 120000) */
  timeoutMs?: number;
  /** Pause workflow and wait for human approval before continuing */
  requiresApproval?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  /** Called after each step to decide whether to continue */
  onStepComplete?: (
    stepIndex: number,
    output: StepOutput,
    allOutputs: StepOutput[]
  ) => "continue" | "pause" | "abort";
}

export interface StepOutput {
  stepName: string;
  output: string;
  durationMs: number;
  skipped: boolean;
}

export interface WorkflowResult {
  runId: string;
  workflowId: string;
  status: "completed" | "paused" | "failed";
  steps: StepOutput[];
  totalDurationMs: number;
  pauseReason?: string;
  error?: string;
  /** Step index to resume from (only when paused) */
  resumeFromStep?: number;
}

export interface WorkflowProgress {
  workflowId: string;
  runId: string;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  status: "running" | "paused" | "completed" | "failed";
}

export type WorkflowProgressCallback = (progress: WorkflowProgress) => void;
