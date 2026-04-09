// ============================================================
// The Hive — Witness
// Background health monitor. Detects stuck agents, enforces
// resource budgets, tracks memory pressure.
// ============================================================

import type { AgentPool } from "./pool.js";
import type { Mission } from "./types.js";

export interface WitnessConfig {
  pool: AgentPool;
  /** Get active missions for budget enforcement */
  getMissions: () => Mission[];
  /** Cancel a mission by ID */
  cancelMission: (id: string) => boolean;
  /** Check interval in ms (default 30s) */
  intervalMs?: number;
  /** Max heap MB before pausing queue (default 80% of system) */
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

  private async patrol(): Promise<void> {
    this.checkStuckAgents();
    this.checkMemoryPressure();
    this.checkQueueHealth();
    this.enforceBudgets();
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
        console.log(`[witness] Killed stuck agent: ${worker.taskId} (${worker.role}, ${Math.round(worker.elapsed / 60000)}min)`);
      }
    }
  }

  private checkMemoryPressure(): void {
    const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const threshold = this.config.heapWarningMb ?? 512;

    if (heapMb > threshold) {
      this.alert({
        level: "critical",
        type: "memory-pressure",
        message: `Heap ${heapMb}MB exceeds ${threshold}MB threshold`,
        timestamp: new Date(),
      });
      console.warn(`[witness] Memory pressure: ${heapMb}MB heap`);
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
