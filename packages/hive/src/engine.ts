// ============================================================
// The Hive — Engine
// Orchestrates the full lifecycle: decompose → schedule → execute
// → verify → merge. Memory-powered, self-healing.
// ============================================================

import { randomUUID } from "node:crypto";
import type { Mission, MissionBudget, HiveTask, HiveMetrics, AgentRole, ModelTier } from "./types.js";
import { AgentPool } from "./pool.js";
import { DAGScheduler } from "./dag.js";
import { getRole } from "./roles/index.js";
import { recordTaskResult, getProfileSummary } from "./agent-memory.js";
import { runAutoChecks, runContainmentChecks, formatResults } from "./verification.js";

const DEFAULT_BUDGET: MissionBudget = { maxTasks: 20, maxDurationMs: 30 * 60 * 1000 };

interface HiveEngineConfig {
  pool: AgentPool;
  /** Optional: memory service for agent profiles + cross-agent knowledge */
  memoryService?: {
    search(query: string, limit?: number): Promise<{ content: string }[]>;
    store(memory: { content: string; type: string; tags?: string[]; importance?: number }): Promise<string>;
  };
  /** Optional: callback for mission/task events */
  onEvent?: (event: HiveEvent) => void;
}

export interface HiveEvent {
  type: "mission:created" | "mission:completed" | "mission:failed" |
        "task:started" | "task:completed" | "task:failed" | "task:repair";
  missionId: string;
  taskId?: string;
  data?: Record<string, unknown>;
}

export class HiveEngine {
  private pool: AgentPool;
  private scheduler: DAGScheduler;
  private missions = new Map<string, Mission>();
  private memoryService?: HiveEngineConfig["memoryService"];
  private onEvent?: (event: HiveEvent) => void;

  constructor(config: HiveEngineConfig) {
    this.pool = config.pool;
    this.scheduler = new DAGScheduler(this.pool);
    this.memoryService = config.memoryService;
    this.onEvent = config.onEvent;

    // Wire task events + verification + profiling
    this.scheduler.onTask((task, event) => {
      this.emit({
        type: `task:${event}` as HiveEvent["type"],
        missionId: task.missionId,
        taskId: task.id,
        data: { role: task.role, model: task.model },
      });

      // Record result for agent profiling
      if (event === "completed" || event === "failed") {
        recordTaskResult(task, this.memoryService).catch(() => {});
      }

      // Auto-verification: when a Builder completes, run tsc + inject Sentinel
      if (event === "completed" && task.role === "builder") {
        this.onBuilderCompleted(task).catch((err) => {
          console.error(`[hive] Verification failed for ${task.id}:`, err);
        });
      }

      // Auto-repair: when Sentinel says NEEDS_REPAIR, re-run Builder
      if (event === "completed" && task.role === "sentinel" && task.result?.includes("NEEDS_REPAIR")) {
        this.onRepairNeeded(task).catch((err) => {
          console.error(`[hive] Repair dispatch failed for ${task.id}:`, err);
        });
      }
    });
  }

  /**
   * Dispatch a mission: decompose the goal into tasks, then execute the DAG.
   */
  async dispatch(goal: string, model: ModelTier = "opus", budget?: Partial<MissionBudget>): Promise<Mission> {
    const mission: Mission = {
      id: randomUUID(),
      goal,
      status: "planning",
      tasks: [],
      budget: { ...DEFAULT_BUDGET, ...budget },
      createdAt: new Date(),
    };
    this.missions.set(mission.id, mission);
    this.emit({ type: "mission:created", missionId: mission.id, data: { goal } });

    try {
      // Phase 1: Commander decomposes the goal into a task DAG
      console.log(`[hive] Mission ${mission.id.slice(0, 8)}: decomposing "${goal.slice(0, 80)}..."`);
      const tasks = await this.decompose(mission, model);
      mission.tasks = tasks;

      // Phase 2: Execute the DAG
      console.log(`[hive] Mission ${mission.id.slice(0, 8)}: executing ${tasks.length} tasks`);
      await this.scheduler.execute(mission);

      // Phase 3: Store learnings
      await this.storeLearnings(mission);

      if (mission.status === "completed") {
        this.emit({ type: "mission:completed", missionId: mission.id });
        console.log(`[hive] Mission ${mission.id.slice(0, 8)}: completed (${mission.tasks.length} tasks)`);
      } else {
        this.emit({ type: "mission:failed", missionId: mission.id, data: { error: mission.error } });
        console.log(`[hive] Mission ${mission.id.slice(0, 8)}: failed — ${mission.error}`);
      }
    } catch (err) {
      mission.status = "failed";
      mission.error = err instanceof Error ? err.message : String(err);
      console.error(`[hive] Mission ${mission.id.slice(0, 8)} error:`, mission.error);
      this.emit({ type: "mission:failed", missionId: mission.id, data: { error: mission.error } });
    }

    return mission;
  }

  /**
   * Get a mission by ID.
   */
  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  /**
   * List recent missions.
   */
  listMissions(limit = 20): Mission[] {
    return Array.from(this.missions.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Cancel a running mission.
   */
  cancel(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== "executing") return false;

    for (const task of mission.tasks) {
      if (task.status === "running" || task.status === "queued") {
        this.pool.cancel(task.id);
        task.status = "cancelled";
      } else if (task.status === "pending") {
        task.status = "cancelled";
      }
    }

    mission.status = "cancelled";
    return true;
  }

  /**
   * Get pool metrics.
   */
  getMetrics(): HiveMetrics {
    return this.pool.getMetrics();
  }

  /**
   * Adjust pool size dynamically.
   */
  scale(newMax: number): void {
    this.pool.scale(newMax);
  }

  // ── Internal ─────────────────────────────────────────────

  private async decompose(mission: Mission, model: ModelTier): Promise<HiveTask[]> {
    const commanderRole = getRole("commander");

    // Load relevant context from memory
    let memoryContext = "";
    if (this.memoryService && commanderRole.memoryProfile.preloadQuery) {
      try {
        const memories = await this.memoryService.search(
          `${commanderRole.memoryProfile.preloadQuery} ${mission.goal}`,
          5,
        );
        if (memories.length > 0) {
          memoryContext = `\n\nRelevant knowledge from previous missions:\n${memories.map((m) => `- ${m.content}`).join("\n")}`;
        }
      } catch {
        // Memory unavailable — continue without it
      }
    }

    const profileContext = getProfileSummary();

    const prompt = `Decompose this goal into a task DAG for parallel agent execution:

GOAL: ${mission.goal}

BUDGET: Maximum ${mission.budget.maxTasks} tasks. Keep it focused.
${memoryContext}
${profileContext !== "No agent profiles yet." ? `\nAgent performance:\n${profileContext}` : ""}

Remember: output ONLY a JSON array of task objects. Each task needs: id, role, model, prompt, dependsOn, priority.`;

    const result = await this.pool.submit({
      id: `${mission.id}-commander`,
      missionId: mission.id,
      role: "commander",
      model,
      prompt,
      systemPrompt: commanderRole.systemPrompt,
      allowedTools: commanderRole.allowedTools,
      dependsOn: [],
      priority: "critical",
      status: "pending",
      repairAttempts: 0,
    });

    // Parse the DAG from Commander's output
    const tasks = this.parseTaskDAG(result, mission.id);

    // Enforce task budget
    if (tasks.length > mission.budget.maxTasks) {
      console.warn(`[hive] Commander produced ${tasks.length} tasks, budget is ${mission.budget.maxTasks} — truncating`);
      return tasks.slice(0, mission.budget.maxTasks);
    }

    return tasks;
  }

  /**
   * When a Builder completes, run automated checks (tsc, tests) AND
   * containment checks in parallel. These are code-level checks that
   * don't trust the Sentinel — they verify independently.
   * The Sentinel can be fooled. These can't.
   */
  private async onBuilderCompleted(task: HiveTask): Promise<void> {
    const cwd = task.worktreePath || process.cwd();
    console.log(`[hive] Running auto-checks + containment for builder ${task.id}...`);

    // Run both in parallel — Sentinel is AI (can be fooled), these are deterministic
    const [codeResults, containmentResults] = await Promise.all([
      runAutoChecks(cwd),
      runContainmentChecks(cwd),
    ]);

    const allCode = codeResults.every((r) => r.passed);
    const allContainment = containmentResults.every((r) => r.passed);

    if (!allContainment) {
      // Containment failure = hard reject. No repair, no second chance.
      const failed = containmentResults.filter((r) => !r.passed).map((r) => `${r.check}: ${r.output.slice(0, 100)}`);
      console.error(`[hive] CONTAINMENT VIOLATION for ${task.id}: ${failed.join("; ")}`);
      this.emit({
        type: "task:failed",
        missionId: task.missionId,
        taskId: task.id,
        data: { containmentViolation: true, checks: failed },
      });
      // Force task to failed — override any Sentinel approval
      task.status = "failed";
      task.error = `Containment violation: ${failed.join("; ")}`;
      return;
    }

    if (!allCode) {
      const summary = formatResults(codeResults);
      console.warn(`[hive] Auto-checks failed for ${task.id}: ${codeResults.filter((r) => !r.passed).map((r) => r.check).join(", ")}`);
      this.emit({
        type: "task:repair",
        missionId: task.missionId,
        taskId: task.id,
        data: { autoChecks: summary, passed: false },
      });
    }
  }

  /**
   * When a Sentinel flags NEEDS_REPAIR, dispatch a repair Builder task.
   */
  private async onRepairNeeded(sentinelTask: HiveTask): Promise<void> {
    // Find the original builder task this sentinel reviewed
    const mission = this.missions.get(sentinelTask.missionId);
    if (!mission) return;

    // Find the builder that produced the work being reviewed
    const builderDep = sentinelTask.dependsOn[0];
    const originalBuilder = mission.tasks.find((t) => t.id === builderDep);
    if (!originalBuilder) return;

    if (originalBuilder.repairAttempts >= 3) {
      console.warn(`[hive] Builder ${originalBuilder.id} hit max repairs (3) — giving up`);
      this.emit({
        type: "task:failed",
        missionId: mission.id,
        taskId: originalBuilder.id,
        data: { reason: "max-repairs-exceeded" },
      });
      return;
    }

    originalBuilder.repairAttempts++;
    console.log(`[hive] Dispatching repair for ${originalBuilder.id} (attempt ${originalBuilder.repairAttempts})`);

    // Create a repair task
    const repairTask: HiveTask = {
      id: `${originalBuilder.id}-repair-${originalBuilder.repairAttempts}`,
      missionId: mission.id,
      role: "builder",
      model: originalBuilder.model,
      prompt: `REPAIR TASK: The previous attempt had issues.\n\nOriginal task: ${originalBuilder.prompt}\n\nSentinel feedback: ${sentinelTask.result}\n\nFix the issues identified by the Sentinel. Do not start from scratch — fix the specific problems.`,
      systemPrompt: originalBuilder.systemPrompt,
      allowedTools: originalBuilder.allowedTools,
      dependsOn: [],
      priority: "high",
      status: "pending",
      repairAttempts: originalBuilder.repairAttempts,
      worktreePath: originalBuilder.worktreePath,
    };

    mission.tasks.push(repairTask);
    this.pool.submit(repairTask).catch(() => {});
    this.emit({ type: "task:repair", missionId: mission.id, taskId: repairTask.id });
  }

  private parseTaskDAG(commanderOutput: string, missionId: string): HiveTask[] {
    // Extract JSON array from output — may be wrapped in markdown code blocks or mixed with text
    // Try multiple extraction strategies
    let jsonStr: string | null = null;

    // Strategy 1: JSON in code block
    const codeBlockMatch = commanderOutput.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1];

    // Strategy 2: Raw JSON array
    if (!jsonStr) {
      const rawMatch = commanderOutput.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (rawMatch) jsonStr = rawMatch[0];
    }

    if (!jsonStr) {
      console.error(`[hive] Commander output (no JSON found): ${commanderOutput.slice(0, 500)}`);
      throw new Error("Commander did not produce a valid task DAG");
    }

    const jsonMatch = [jsonStr];

    const raw = JSON.parse(jsonMatch[0]) as Array<{
      id: string;
      role: AgentRole;
      model: ModelTier;
      prompt: string;
      dependsOn: string[];
      priority: "critical" | "high" | "normal" | "background";
    }>;

    return raw.map((t) => {
      const role = getRole(t.role);
      return {
        id: t.id,
        missionId,
        role: t.role,
        model: t.model || role.defaultModel,
        prompt: t.prompt,
        systemPrompt: role.systemPrompt,
        allowedTools: role.allowedTools,
        dependsOn: t.dependsOn || [],
        priority: t.priority || "normal",
        status: "pending" as const,
        repairAttempts: 0,
      };
    });
  }

  private async storeLearnings(mission: Mission): Promise<void> {
    if (!this.memoryService) return;

    const completed = mission.tasks.filter((t) => t.status === "completed");
    const failed = mission.tasks.filter((t) => t.status === "failed");

    if (failed.length > 0) {
      const failSummary = failed.map((t) => `${t.role}/${t.id}: ${t.error}`).join("; ");
      try {
        await this.memoryService.store({
          content: `Hive mission "${mission.goal.slice(0, 100)}" had ${failed.length} failures: ${failSummary}`,
          type: "pattern",
          tags: ["hive", "failure", "auto-learning"],
          importance: 0.7,
        });
      } catch {
        // Non-critical
      }
    }

    if (mission.status === "completed" && completed.length >= 3) {
      try {
        await this.memoryService.store({
          content: `Hive mission completed: "${mission.goal.slice(0, 100)}" — ${completed.length} tasks, roles used: ${[...new Set(completed.map((t) => t.role))].join(", ")}`,
          type: "event",
          tags: ["hive", "success", "auto-learning"],
          importance: 0.5,
        });
      } catch {
        // Non-critical
      }
    }
  }

  private emit(event: HiveEvent): void {
    try {
      this.onEvent?.(event);
    } catch {
      // Event errors don't affect execution
    }
  }
}
