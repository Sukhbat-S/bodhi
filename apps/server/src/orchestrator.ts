// ============================================================
// BODHI — Mission Orchestrator
// Decomposes goals into parallel tasks, executes via Bridge
// ============================================================

import type { AIBackend, BridgeTask } from "@seneca/core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

// --- Types ---

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
}

export interface MissionTask extends PlannedTask {
  status: "pending" | "running" | "completed" | "failed";
  progress: string[];
  result?: string;
  error?: string;
  worktreePath?: string;
  bridgeTask?: BridgeTask;
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
        p.tasks.map((t) => ({ ...t, status: "pending" as const, progress: [] }))
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
      mission.status = failed.length > 0 ? "failed" : "completed";
      mission.completedAt = new Date();
      onEvent({
        type: mission.status === "completed" ? "mission:completed" : "mission:failed",
        missionId,
        result: mission.tasks.map((t) => `[${t.status}] ${t.title}: ${t.result || t.error || ""}`).join("\n"),
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
    const prompt = `You are a project decomposition specialist. Break this goal into executable tasks.

## Goal
${goal}

## Rules
- Each task must be completable by one Claude Code agent
- Tasks in the same phase can run in parallel
- Keep tasks focused — one clear objective per task
- Each task prompt should be self-contained (the agent has no context from other tasks)
- Estimate minutes realistically

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
          "prompt": "Full prompt for the Claude Code agent — include file paths, what to do, what to output",
          "estimatedMinutes": number,
          "dependencies": ["id-of-task-that-must-complete-first"]
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

    // Create worktree for isolation if multiple tasks in mission
    const useWorktree = mission.tasks.length > 1;
    let cwd = this.basePath;

    if (useWorktree) {
      try {
        cwd = this.createWorktree(task.id);
        task.worktreePath = cwd;
      } catch {
        // Worktree creation failed, fall back to base path
        cwd = this.basePath;
      }
    }

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
        }
      });

      task.bridgeTask = bridgeTask;

      if (bridgeTask.status === "completed") {
        task.status = "completed";
        task.result = bridgeTask.result;
        onEvent({ type: "task:completed", missionId: mission.id, taskId: task.id, result: bridgeTask.result });
      } else {
        task.status = "failed";
        task.error = bridgeTask.error;
        onEvent({ type: "task:failed", missionId: mission.id, taskId: task.id, error: bridgeTask.error });
      }
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      onEvent({ type: "task:failed", missionId: mission.id, taskId: task.id, error: task.error });
    }
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
}
