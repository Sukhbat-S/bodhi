// ============================================================
// The Hive — DAG Scheduler
// Resolves task dependencies and feeds ready tasks to the pool.
// Tasks auto-schedule when all dependencies complete.
// ============================================================

import type { HiveTask, Mission, TaskStatus } from "./types.js";
import type { AgentPool } from "./pool.js";

type TaskListener = (task: HiveTask, event: "started" | "completed" | "failed") => void;

export class DAGScheduler {
  private pool: AgentPool;
  private listeners: TaskListener[] = [];

  constructor(pool: AgentPool) {
    this.pool = pool;
  }

  /**
   * Execute a mission's task DAG. Resolves when all tasks complete or any critical task fails.
   */
  async execute(mission: Mission): Promise<void> {
    mission.status = "executing";
    const tasks = new Map(mission.tasks.map((t) => [t.id, t]));
    const results = new Map<string, Promise<string>>();

    // Validate DAG: no cycles
    this.validateDAG(mission.tasks);

    // Find and schedule all initially ready tasks
    const schedule = () => {
      for (const task of tasks.values()) {
        if (task.status !== "pending") continue;
        if (results.has(task.id)) continue;

        const depsResolved = task.dependsOn.every((depId) => {
          const dep = tasks.get(depId);
          return dep?.status === "completed";
        });

        const depsFailed = task.dependsOn.some((depId) => {
          const dep = tasks.get(depId);
          return dep?.status === "failed" || dep?.status === "cancelled";
        });

        if (depsFailed) {
          task.status = "cancelled";
          task.error = "Dependency failed";
          this.emit(task, "failed");
          continue;
        }

        if (depsResolved) {
          task.status = "queued";
          const promise = this.pool.submit(task).then(
            (result) => {
              task.status = "completed";
              task.result = result;
              this.emit(task, "completed");
              schedule(); // trigger next wave
              return result;
            },
            (error) => {
              task.status = "failed";
              task.error = error instanceof Error ? error.message : String(error);
              this.emit(task, "failed");
              schedule(); // trigger next wave (may cancel dependents)
              throw error;
            },
          );
          results.set(task.id, promise);
          this.emit(task, "started");
        }
      }
    };

    schedule();

    // Wait for ALL tasks to settle — including those scheduled by later waves.
    // We loop because schedule() is called recursively from .then() handlers,
    // adding new promises to `results` after the initial batch.
    while (true) {
      const pending = Array.from(results.values());
      if (pending.length === 0) break;

      await Promise.all(pending.map((p) => p.catch(() => "failed")));

      // Check if all tasks are terminal (no pending tasks left to schedule)
      const allTerminal = Array.from(tasks.values()).every(
        (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled",
      );
      if (allTerminal) break;

      // Brief yield to let any newly-scheduled promises register
      await new Promise((r) => setTimeout(r, 50));
    }

    // Determine mission outcome
    const allTasks = Array.from(tasks.values());
    const failedTasks = allTasks.filter((t) => t.status === "failed");
    const completedTasks = allTasks.filter((t) => t.status === "completed");

    if (failedTasks.length > 0) {
      mission.status = "failed";
      mission.error = `${failedTasks.length} tasks failed: ${failedTasks.map((t) => t.id).join(", ")}`;
    } else if (completedTasks.length === allTasks.length) {
      mission.status = "completed";
    } else {
      mission.status = "failed";
      mission.error = "Some tasks did not complete";
    }

    // Collect results from completed tasks
    mission.result = completedTasks
      .map((t) => `[${t.role}] ${t.id}: ${(t.result || "").slice(0, 200)}`)
      .join("\n");
    mission.completedAt = new Date();
  }

  /**
   * Listen for task lifecycle events.
   */
  onTask(listener: TaskListener): void {
    this.listeners.push(listener);
  }

  /**
   * Get execution order as a flat list (topological sort).
   */
  getExecutionOrder(tasks: HiveTask[]): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const task = taskMap.get(id);
      if (!task) return;
      for (const dep of task.dependsOn) {
        visit(dep);
      }
      order.push(id);
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return order;
  }

  /**
   * Check for dependency cycles (throws if found).
   */
  private validateDAG(tasks: HiveTask[]): void {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const hasCycle = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const task = taskMap.get(id);
      if (task) {
        for (const dep of task.dependsOn) {
          if (hasCycle(dep)) return true;
        }
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    for (const task of tasks) {
      if (hasCycle(task.id)) {
        throw new Error(`Cycle detected in task DAG involving task ${task.id}`);
      }
    }
  }

  private emit(task: HiveTask, event: "started" | "completed" | "failed"): void {
    for (const listener of this.listeners) {
      try {
        listener(task, event);
      } catch {
        // listener errors don't affect execution
      }
    }
  }
}
