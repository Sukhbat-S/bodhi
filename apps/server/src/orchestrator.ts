// ============================================================
// BODHI — Mission Orchestrator
// Decomposes goals into parallel tasks, executes via Bridge
// ============================================================

import type { AIBackend, BridgeTask } from "@seneca/core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

// --- Types ---

export interface TaskPrediction {
  outputType: "text" | "code" | "data";
  expectedLengthRange: [number, number]; // [min, max] chars
  shouldContainNumbers: boolean;
  shouldContainCode: boolean;
  durationMinutes: number;
}

export interface PredictionError {
  field: string;
  expected: string;
  actual: string;
  severity: "warning" | "error";
}

export interface TaskPlan {
  goal: string;
  estimatedHours: number;
  phases: Phase[];
}

export interface Phase {
  name: string;
  tasks: PlannedTask[];
}

export interface PlannedTask {
  id: string;
  title: string;
  prompt: string;
  estimatedMinutes: number;
  dependencies: string[];
  predictions?: TaskPrediction;
}

export interface MissionTask extends PlannedTask {
  status: "pending" | "running" | "completed" | "failed" | "repaired";
  progress: string[];
  result?: string;
  error?: string;
  worktreePath?: string;
  bridgeTask?: BridgeTask;
  predictionErrors: PredictionError[];
  repairAttempts: number;
  confidence: number;
}

export interface Mission {
  id: string;
  goal: string;
  model: "opus" | "sonnet";
  status: "planning" | "executing" | "completed" | "failed" | "cancelled";
  plan?: TaskPlan;
  tasks: MissionTask[];
  startedAt: Date;
  completedAt?: Date;
}

export type MissionEvent = {
  type: string;
  missionId: string;
  [key: string]: unknown;
};

// --- Orchestrator ---

export class Orchestrator {
  private backend: AIBackend;
  private basePath: string;
  private missions = new Map<string, Mission>();

  constructor(backend: AIBackend, basePath: string) {
    this.backend = backend;
    this.basePath = basePath;
  }

  async runMission(
    missionId: string,
    goal: string,
    model: "opus" | "sonnet",
    onEvent: (event: MissionEvent) => void,
  ): Promise<Mission> {
    const mission: Mission = {
      id: missionId,
      goal,
      model,
      status: "planning",
      tasks: [],
      startedAt: new Date(),
    };
    this.missions.set(missionId, mission);

    try {
      // Phase 1: Decompose
      onEvent({ type: "mission:planning", missionId, goal });
      const plan = await this.decompose(goal, model);
      mission.plan = plan;
      mission.tasks = plan.phases.flatMap((p) =>
        p.tasks.map((t) => ({
          ...t,
          status: "pending" as const,
          progress: [],
          predictionErrors: [],
          repairAttempts: 0,
          confidence: 1.0,
        }))
      );
      onEvent({ type: "mission:planned", missionId, plan, taskCount: mission.tasks.length });

      // Phase 2: Execute phases sequentially, tasks within phase in parallel
      mission.status = "executing";
      for (const phase of plan.phases) {
        onEvent({ type: "mission:phase", missionId, phase: phase.name });

        const phaseTasks = mission.tasks.filter((t) =>
          phase.tasks.some((pt) => pt.id === t.id)
        );

        // Check dependencies are met
        const ready = phaseTasks.filter((t) =>
          t.dependencies.every((depId) => {
            const dep = mission.tasks.find((mt) => mt.id === depId);
            return dep?.status === "completed";
          })
        );

        // Execute ready tasks in parallel
        await Promise.all(
          ready.map((task) => this.executeTask(mission, task, onEvent))
        );
      }

      // Phase 3: Merge worktrees
      const worktreeTasks = mission.tasks.filter((t) => t.worktreePath);
      for (const task of worktreeTasks) {
        try {
          this.mergeWorktree(task);
          onEvent({ type: "mission:merged", missionId, taskId: task.id });
        } catch (err) {
          onEvent({
            type: "mission:merge-failed",
            missionId,
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const failed = mission.tasks.filter((t) => t.status === "failed");
      const avgConfidence = mission.tasks.length > 0
        ? mission.tasks.reduce((sum, t) => sum + t.confidence, 0) / mission.tasks.length
        : 0;
      mission.status = failed.length > 0 ? "failed" : "completed";
      mission.completedAt = new Date();

      const resultSummary = mission.tasks.map((t) => {
        const badge = t.predictionErrors.length > 0 ? " ⚠" : "";
        return `[${t.status}${badge}] ${t.title}: ${t.result || t.error || ""}`;
      }).join("\n");

      onEvent({
        type: mission.status === "completed" ? "mission:completed" : "mission:failed",
        missionId,
        result: resultSummary,
        confidence: avgConfidence,
        predictionErrors: mission.tasks.flatMap((t) => t.predictionErrors.map((e) => ({ taskId: t.id, ...e }))),
        error: failed.length > 0 ? `${failed.length} task(s) failed` : undefined,
      });
    } catch (err) {
      mission.status = "failed";
      mission.completedAt = new Date();
      onEvent({
        type: "mission:failed",
        missionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.missions.delete(missionId);
    return mission;
  }

  private async decompose(goal: string, model: "opus" | "sonnet"): Promise<TaskPlan> {
    // Load self-model to inject weakness awareness
    const selfModel = this.loadSelfModel();
    const weaknessHints = selfModel.weaknesses.length > 0
      ? `\n\nKnown weaknesses (add extra checks for these):\n${selfModel.weaknesses.map((w) => `- ${w.pattern} (error rate: ${(w.errorRate * 100).toFixed(0)}%)`).join("\n")}`
      : "";

    const prompt = `You are a project decomposition specialist. Break this goal into executable tasks.

## Goal
${goal}

## Rules
- Each task must be completable by one Claude Code agent
- Tasks in the same phase can run in parallel
- Keep tasks focused — one clear objective per task
- Each task prompt should be self-contained (the agent has no context from other tasks)
- Estimate minutes realistically
- For EACH task, generate predictions about the expected output${weaknessHints}

## Output
Return ONLY a JSON object. No explanation, no markdown, no tools:
{
  "goal": "the original goal",
  "estimatedHours": number,
  "phases": [
    {
      "name": "Phase name",
      "tasks": [
        {
          "id": "unique-id",
          "title": "Short title",
          "prompt": "Full prompt for the Claude Code agent",
          "estimatedMinutes": number,
          "dependencies": [],
          "predictions": {
            "outputType": "text|code|data",
            "expectedLengthRange": [minChars, maxChars],
            "shouldContainNumbers": true/false,
            "shouldContainCode": true/false,
            "durationMinutes": number
          }
        }
      ]
    }
  ]
}`;

    const task = await this.backend.execute(prompt, {
      model,
      tools: "",
      noSessionPersistence: true,
      effort: "high",
    });

    const text = task.result || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Orchestrator failed to produce a task plan");
    }

    return JSON.parse(jsonMatch[0]) as TaskPlan;
  }

  private async executeTask(
    mission: Mission,
    task: MissionTask,
    onEvent: (event: MissionEvent) => void,
  ): Promise<void> {
    task.status = "running";
    onEvent({ type: "task:running", missionId: mission.id, taskId: task.id, title: task.title });

    const cwd = this.setupWorktree(mission, task);
    const startTime = Date.now();

    try {
      const bridgeTask = await this.backend.execute(task.prompt, {
        cwd,
        model: mission.model,
        permissionMode: "bypassPermissions",
        maxTurns: 20,
        noSessionPersistence: true,
        effort: "high",
      }, (update) => {
        if (update.type === "progress") {
          task.progress.push(update.content);
          onEvent({ type: "task:progress", missionId: mission.id, taskId: task.id, chunk: update.content });

          // Real-time duration check against prediction
          if (task.predictions?.durationMinutes) {
            const elapsed = (Date.now() - startTime) / 60_000;
            if (elapsed > task.predictions.durationMinutes * 5) {
              onEvent({ type: "task:duration-warning", missionId: mission.id, taskId: task.id, elapsed: Math.round(elapsed) });
            }
          }
        }
      });

      task.bridgeTask = bridgeTask;

      if (bridgeTask.status === "completed") {
        task.result = bridgeTask.result;

        // Intrinsic prediction verification
        task.predictionErrors = this.checkPredictions(task);

        if (task.predictionErrors.length > 0) {
          onEvent({
            type: "task:prediction-error",
            missionId: mission.id,
            taskId: task.id,
            errors: task.predictionErrors,
          });

          // Self-healing: retry if this is the first attempt and errors are fixable
          const hasErrors = task.predictionErrors.some((e) => e.severity === "error");
          if (hasErrors && task.repairAttempts === 0) {
            task.repairAttempts++;
            onEvent({ type: "task:repair", missionId: mission.id, taskId: task.id });
            const repaired = await this.repairTask(mission, task, cwd, onEvent);
            if (repaired) {
              task.status = "repaired";
              task.confidence = 0.7; // lower confidence for repaired tasks
              onEvent({ type: "task:completed", missionId: mission.id, taskId: task.id, result: task.result, repaired: true });
              this.updateSelfModel(task);
              return;
            }
          }

          // Prediction errors but no repair → completed with lower confidence
          task.confidence = task.predictionErrors.some((e) => e.severity === "error") ? 0.5 : 0.8;
        }

        task.status = "completed";
        onEvent({ type: "task:completed", missionId: mission.id, taskId: task.id, result: task.result, confidence: task.confidence });
      } else {
        task.status = "failed";
        task.error = bridgeTask.error;
        task.confidence = 0;
        onEvent({ type: "task:failed", missionId: mission.id, taskId: task.id, error: bridgeTask.error });
      }
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      task.confidence = 0;
      onEvent({ type: "task:failed", missionId: mission.id, taskId: task.id, error: task.error });
    }

    this.updateSelfModel(task);
  }

  private setupWorktree(mission: Mission, task: MissionTask): string {
    if (mission.tasks.length <= 1) return this.basePath;
    try {
      const cwd = this.createWorktree(task.id);
      task.worktreePath = cwd;
      return cwd;
    } catch {
      return this.basePath;
    }
  }

  /** Compare task result against predictions — the cerebellum check */
  private checkPredictions(task: MissionTask): PredictionError[] {
    const errors: PredictionError[] = [];
    const pred = task.predictions;
    const result = task.result || "";
    if (!pred) return errors;

    // Length check
    if (pred.expectedLengthRange) {
      const [min, max] = pred.expectedLengthRange;
      if (result.length < min) {
        errors.push({ field: "length", expected: `${min}-${max} chars`, actual: `${result.length} chars`, severity: result.length < min / 3 ? "error" : "warning" });
      }
      if (result.length > max * 3) {
        errors.push({ field: "length", expected: `${min}-${max} chars`, actual: `${result.length} chars`, severity: "warning" });
      }
    }

    // Content type checks
    if (pred.shouldContainNumbers && !/\d/.test(result)) {
      errors.push({ field: "numbers", expected: "contains numbers", actual: "no numbers found", severity: "error" });
    }

    if (pred.shouldContainCode && !/```|function |const |import |class /.test(result)) {
      errors.push({ field: "code", expected: "contains code", actual: "no code found", severity: "warning" });
    }

    return errors;
  }

  /** DNA repair: retry with corrected context */
  private async repairTask(
    mission: Mission,
    task: MissionTask,
    cwd: string,
    onEvent: (event: MissionEvent) => void,
  ): Promise<boolean> {
    const errorDesc = task.predictionErrors.map((e) => `${e.field}: expected ${e.expected}, got ${e.actual}`).join("; ");

    const repairPrompt = `Previous attempt at this task produced an incorrect result.

Original task: ${task.prompt}

Previous result: ${(task.result || "").slice(0, 500)}

Prediction errors: ${errorDesc}

Please try again, paying careful attention to the prediction errors above. Make sure your output matches the expected format.`;

    try {
      const bridgeTask = await this.backend.execute(repairPrompt, {
        cwd,
        model: mission.model,
        permissionMode: "bypassPermissions",
        maxTurns: 15,
        noSessionPersistence: true,
        effort: "high",
      }, (update) => {
        if (update.type === "progress") {
          task.progress.push(update.content);
          onEvent({ type: "task:progress", missionId: mission.id, taskId: task.id, chunk: update.content });
        }
      });

      if (bridgeTask.status === "completed") {
        task.result = bridgeTask.result;
        task.predictionErrors = this.checkPredictions(task);
        return task.predictionErrors.filter((e) => e.severity === "error").length === 0;
      }
    } catch { /* repair failed */ }
    return false;
  }

  private createWorktree(taskId: string): string {
    const worktreePath = join(this.basePath, "..", `worktree-${taskId}`);
    const branchName = `task-${taskId}`;

    if (existsSync(worktreePath)) {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: this.basePath, stdio: "ignore" });
    }

    execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
      cwd: this.basePath,
      stdio: "ignore",
    });

    return worktreePath;
  }

  private mergeWorktree(task: MissionTask): void {
    if (!task.worktreePath) return;
    const branchName = `task-${task.id}`;

    try {
      // Check if branch has changes
      const diff = execSync(`git diff main..${branchName} --name-only`, {
        cwd: this.basePath,
        encoding: "utf-8",
      }).trim();

      if (diff) {
        execSync(`git merge --no-ff ${branchName} -m "Mission task: ${task.title}"`, {
          cwd: this.basePath,
          stdio: "ignore",
        });
      }

      // Cleanup
      execSync(`git worktree remove "${task.worktreePath}"`, {
        cwd: this.basePath,
        stdio: "ignore",
      });
      execSync(`git branch -d ${branchName}`, {
        cwd: this.basePath,
        stdio: "ignore",
      });
    } catch {
      // Cleanup even on failure
      try {
        execSync(`git worktree remove "${task.worktreePath}" --force`, {
          cwd: this.basePath,
          stdio: "ignore",
        });
        execSync(`git branch -D ${branchName}`, {
          cwd: this.basePath,
          stdio: "ignore",
        });
      } catch { /* best effort */ }
      throw new Error(`Merge conflict on branch ${branchName}`);
    }
  }

  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  // --- Self-Model (Prefrontal Cortex) ---

  private selfModelPath(): string {
    return join(this.basePath, "data", "self-model.json");
  }

  private loadSelfModel(): SelfModel {
    try {
      const raw = readFileSync(this.selfModelPath(), "utf-8");
      return JSON.parse(raw) as SelfModel;
    } catch {
      return { weaknesses: [], strengths: [], totalTasks: 0, totalErrors: 0 };
    }
  }

  private updateSelfModel(task: MissionTask): void {
    const model = this.loadSelfModel();
    model.totalTasks++;

    if (task.predictionErrors.length > 0) {
      model.totalErrors++;
      // Extract weakness patterns from prediction errors
      for (const err of task.predictionErrors) {
        const pattern = `${err.field} in ${task.title.toLowerCase()}`;
        const existing = model.weaknesses.find((w) => w.pattern === err.field);
        if (existing) {
          existing.errorRate = (existing.errorRate * existing.occurrences + 1) / (existing.occurrences + 1);
          existing.occurrences++;
          existing.lastSeen = new Date().toISOString();
        } else {
          model.weaknesses.push({
            pattern: err.field,
            errorRate: 1,
            occurrences: 1,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    } else if (task.status === "completed") {
      // Successful — track strength
      const titleWords = task.title.toLowerCase().split(/\s+/);
      for (const word of titleWords) {
        if (word.length < 4) continue; // skip short words
        const existing = model.strengths.find((s) => s.pattern === word);
        if (existing) {
          existing.successRate = (existing.successRate * existing.occurrences + 1) / (existing.occurrences + 1);
          existing.occurrences++;
        } else {
          model.strengths.push({ pattern: word, successRate: 1, occurrences: 1 });
        }
      }

      // Decay weaknesses that haven't recurred
      model.weaknesses = model.weaknesses.filter((w) => {
        const daysSince = (Date.now() - new Date(w.lastSeen).getTime()) / 86_400_000;
        return daysSince < 30 || w.occurrences > 3;
      });
    }

    // Keep lists manageable
    model.weaknesses = model.weaknesses.slice(0, 20);
    model.strengths = model.strengths.slice(0, 20);

    try {
      const dir = join(this.basePath, "data");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.selfModelPath(), JSON.stringify(model, null, 2));
    } catch { /* non-critical */ }
  }
}

interface SelfModel {
  weaknesses: Array<{ pattern: string; errorRate: number; occurrences: number; lastSeen: string }>;
  strengths: Array<{ pattern: string; successRate: number; occurrences: number }>;
  totalTasks: number;
  totalErrors: number;
}
