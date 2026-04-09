// ============================================================
// The Hive — Engine
// Orchestrates the full lifecycle: decompose → schedule → execute
// → verify → merge. Memory-powered, self-healing.
// ============================================================

import { randomUUID } from "node:crypto";
import type { Mission, HiveTask, HiveMetrics, AgentRole, ModelTier } from "./types.js";
import { AgentPool } from "./pool.js";
import { DAGScheduler } from "./dag.js";
import { getRole } from "./roles/index.js";

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

    // Wire task events
    this.scheduler.onTask((task, event) => {
      this.emit({
        type: `task:${event}` as HiveEvent["type"],
        missionId: task.missionId,
        taskId: task.id,
        data: { role: task.role, model: task.model },
      });
    });
  }

  /**
   * Dispatch a mission: decompose the goal into tasks, then execute the DAG.
   */
  async dispatch(goal: string, model: ModelTier = "opus"): Promise<Mission> {
    const mission: Mission = {
      id: randomUUID(),
      goal,
      status: "planning",
      tasks: [],
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

    const prompt = `Decompose this goal into a task DAG for parallel agent execution:

GOAL: ${mission.goal}
${memoryContext}

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
    return tasks;
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
