// ============================================================
// The Hive — Witness
// Background health monitor. Detects stuck agents, enforces
// resource budgets, tracks memory pressure.
// ============================================================

import type { AgentPool } from "./pool.js";
import type { Mission } from "./types.js";
import { runContainmentChecks } from "./verification.js";

export interface WitnessConfig {
  pool: AgentPool;
  /** Get active missions for budget enforcement */
  getMissions: () => Mission[];
  /** Cancel a mission by ID */
  cancelMission: (id: string) => boolean;
  /** Re-submit a stuck task for retry */
  retryTask?: (taskId: string, missionId: string) => void;
  /** Check interval in ms (default 30s) */
  intervalMs?: number;
  /** Max heap MB before pausing queue (default 512) */
  heapWarningMb?: number;
  /** Callback for alerts */
  onAlert?: (alert: WitnessAlert) => void;
}

export interface WitnessAlert {
  level: "warning" | "critical";
  type: "stuck-agent" | "memory-pressure" | "queue-backlog" | "budget-exceeded";
  message: string;
  timestamp: Date;
}

export class HiveWitness {
  private config: WitnessConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private alerts: WitnessAlert[] = [];

  constructor(config: WitnessConfig) {
    this.config = config;
  }

  start(): void {
    const interval = this.config.intervalMs ?? 30_000;
    this.timer = setInterval(() => this.patrol(), interval);
    console.log(`[witness] Started — patrol every ${interval / 1000}s`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[witness] Stopped");
  }

  getAlerts(limit = 20): WitnessAlert[] {
    return this.alerts.slice(-limit);
  }

  private consecutiveFailures = 0;
  private retryCount = new Map<string, number>();

  private async patrol(): Promise<void> {
    try {
      this.checkStuckAgents();
      await this.checkActiveAgentBehavior();
      this.checkMemoryPressure();
      this.checkQueueHealth();
      this.enforceBudgets();
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      console.error(`[witness] Patrol failed (${this.consecutiveFailures}x):`, err instanceof Error ? err.message : err);
      if (this.consecutiveFailures >= 5) {
        console.error("[witness] 5 consecutive patrol failures — stopping witness to prevent loop");
        this.stop();
        this.alert({ level: "critical", type: "stuck-agent", message: "Witness self-terminated after 5 consecutive patrol failures", timestamp: new Date() });
      }
    }
  }

  private checkStuckAgents(): void {
    const active = this.config.pool.getActive();
    const stuckThreshold = 5 * 60 * 1000; // 5 minutes

    for (const worker of active) {
      if (worker.elapsed > stuckThreshold) {
        this.alert({
          level: "warning",
          type: "stuck-agent",
          message: `Agent ${worker.taskId} (${worker.role}) stuck for ${Math.round(worker.elapsed / 60000)}min`,
          timestamp: new Date(),
        });
        // Kill stuck task
        this.config.pool.cancel(worker.taskId);

        // Retry — but cap at 2 retries per task to prevent infinite kill-retry loop
        const retries = this.retryCount.get(worker.taskId) ?? 0;
        if (retries < 2 && this.config.retryTask) {
          this.retryCount.set(worker.taskId, retries + 1);
          this.config.retryTask(worker.taskId, worker.role);
          console.log(`[witness] Killed + retried stuck agent: ${worker.taskId} (attempt ${retries + 1}/2)`);
        } else {
          console.log(`[witness] Killed stuck agent: ${worker.taskId} — no more retries`);
          this.retryCount.delete(worker.taskId);
        }
      }
    }
  }

  /**
   * Spot-check active agents for containment violations.
   * Only checks agents running > 2min (give them time to start).
   */
  private async checkActiveAgentBehavior(): Promise<void> {
    const active = this.config.pool.getActive();
    const minRuntime = 2 * 60 * 1000; // 2 minutes

    for (const worker of active) {
      if (worker.elapsed < minRuntime) continue;

      try {
        const results = await runContainmentChecks(worker.cwd);
        const violations = results.filter((r) => !r.passed);

        if (violations.length > 0) {
          const details = violations.map((v) => `${v.check}: ${v.output.slice(0, 80)}`).join("; ");
          this.alert({
            level: "critical",
            type: "stuck-agent",
            message: `Containment violation mid-task: ${worker.taskId} (${worker.role}) — ${details}`,
            timestamp: new Date(),
          });
          this.config.pool.cancel(worker.taskId);
          console.error(`[witness] Killed agent ${worker.taskId} for mid-task containment violation: ${details}`);
        }
      } catch {
        // Containment check failed to run — not a violation, just skip
      }
    }
  }

  private queuePaused = false;

  private checkMemoryPressure(): void {
    const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const threshold = this.config.heapWarningMb ?? 512;

    if (heapMb > threshold && !this.queuePaused) {
      this.queuePaused = true;
      // Scale pool to 1 to stop accepting new work
      this.config.pool.scale(1);
      this.alert({
        level: "critical",
        type: "memory-pressure",
        message: `Heap ${heapMb}MB exceeds ${threshold}MB — pool scaled to 1, draining`,
        timestamp: new Date(),
      });
      console.warn(`[witness] Memory pressure: ${heapMb}MB — pool throttled to 1`);
    } else if (heapMb < threshold * 0.7 && this.queuePaused) {
      // Recovered — restore pool
      this.queuePaused = false;
      this.config.pool.scale(10);
      console.log(`[witness] Memory recovered: ${heapMb}MB — pool restored to 10`);
    }
  }

  private checkQueueHealth(): void {
    const metrics = this.config.pool.getMetrics();

    if (metrics.queueDepth > 50) {
      this.alert({
        level: "warning",
        type: "queue-backlog",
        message: `Queue backlog: ${metrics.queueDepth} tasks waiting (${metrics.activeWorkers}/${metrics.poolSize} active)`,
        timestamp: new Date(),
      });
    }
  }

  private enforceBudgets(): void {
    const missions = this.config.getMissions();

    for (const mission of missions) {
      if (mission.status !== "executing") continue;

      // Task count budget
      const maxTasks = (mission as MissionWithBudget).maxTasks ?? 20;
      if (mission.tasks.length > maxTasks) {
        this.alert({
          level: "critical",
          type: "budget-exceeded",
          message: `Mission ${mission.id.slice(0, 8)} has ${mission.tasks.length} tasks (budget: ${maxTasks})`,
          timestamp: new Date(),
        });
        this.config.cancelMission(mission.id);
        console.warn(`[witness] Cancelled mission ${mission.id.slice(0, 8)}: exceeded task budget (${mission.tasks.length}/${maxTasks})`);
      }

      // Duration budget
      const maxDurationMs = (mission as MissionWithBudget).maxDurationMs ?? 30 * 60 * 1000;
      const elapsed = Date.now() - mission.createdAt.getTime();
      if (elapsed > maxDurationMs) {
        this.alert({
          level: "critical",
          type: "budget-exceeded",
          message: `Mission ${mission.id.slice(0, 8)} exceeded duration budget (${Math.round(elapsed / 60000)}min / ${Math.round(maxDurationMs / 60000)}min)`,
          timestamp: new Date(),
        });
        this.config.cancelMission(mission.id);
        console.warn(`[witness] Cancelled mission ${mission.id.slice(0, 8)}: exceeded duration budget`);
      }
    }
  }

  private alert(alert: WitnessAlert): void {
    this.alerts.push(alert);
    // Keep last 100 alerts
    if (this.alerts.length > 100) this.alerts.shift();
    this.config.onAlert?.(alert);
  }
}

// Extended Mission type with budget fields
interface MissionWithBudget extends Mission {
  maxTasks?: number;
  maxDurationMs?: number;
}
