// ============================================================
// The Hive — Agent Pool
// Semaphore-controlled concurrent execution with multi-backend
// and priority queue. The engine room of the swarm.
// ============================================================

import type { HiveTask, HiveMetrics, BackendType, PoolConfig } from "./types.js";

interface Backend {
  execute(prompt: string, options?: Record<string, unknown>): Promise<{ content: string }>;
}

interface QueueEntry {
  task: HiveTask;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, background: 3 };

export class AgentPool {
  private config: PoolConfig;
  private backends: Partial<Record<BackendType, Backend>>;
  private active = new Map<string, { task: HiveTask; startedAt: number }>();
  private queue: QueueEntry[] = [];
  private stats = { completed: 0, failed: 0, totalDurationMs: 0 };
  private backendUsage: Record<BackendType, number> = { sdk: 0, bridge: 0, api: 0 };
  private startTime = Date.now();

  constructor(config: PoolConfig, backends: Partial<Record<BackendType, Backend>>) {
    this.config = config;
    this.backends = backends;
    console.log(`[hive] Pool initialized: max=${config.maxConcurrent}, backend=${config.preferredBackend}`);
  }

  /**
   * Submit a task for execution. Returns when the task completes.
   * If the pool is full, the task waits in a priority queue.
   */
  async submit(task: HiveTask): Promise<string> {
    if (this.queue.length >= 100) {
      throw new Error("Hive queue full (100 tasks). Backpressure engaged.");
    }

    return new Promise<string>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.sortQueue();
      this.drain();
    });
  }

  /**
   * Cancel a running or queued task.
   */
  cancel(taskId: string): boolean {
    // Remove from queue
    const qIdx = this.queue.findIndex((e) => e.task.id === taskId);
    if (qIdx >= 0) {
      const [entry] = this.queue.splice(qIdx, 1);
      entry.reject(new Error("Cancelled"));
      return true;
    }

    // Mark active task for cancellation (backend-specific)
    if (this.active.has(taskId)) {
      this.active.delete(taskId);
      this.drain();
      return true;
    }

    return false;
  }

  /**
   * Wait for all active and queued tasks to complete.
   */
  async waitAll(): Promise<void> {
    while (this.active.size > 0 || this.queue.length > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /**
   * Get current pool metrics.
   */
  getMetrics(): HiveMetrics {
    const uptime = (Date.now() - this.startTime) / 3600000; // hours
    return {
      poolSize: this.config.maxConcurrent,
      activeWorkers: this.active.size,
      queueDepth: this.queue.length,
      completed: this.stats.completed,
      failed: this.stats.failed,
      avgDurationMs: this.stats.completed > 0
        ? Math.round(this.stats.totalDurationMs / this.stats.completed)
        : 0,
      throughputPerHour: uptime > 0 ? Math.round(this.stats.completed / uptime) : 0,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      backendUsage: { ...this.backendUsage },
    };
  }

  /**
   * Dynamically adjust pool size.
   */
  scale(newMax: number): void {
    this.config.maxConcurrent = Math.max(1, Math.min(50, newMax));
    console.log(`[hive] Pool scaled to ${this.config.maxConcurrent}`);
    this.drain();
  }

  /**
   * Get list of active workers for monitoring.
   */
  getActive(): { taskId: string; role: string; elapsed: number; cwd: string }[] {
    return Array.from(this.active.entries()).map(([id, w]) => ({
      taskId: id,
      role: w.task.role,
      elapsed: Date.now() - w.startedAt,
      cwd: w.task.worktreePath || process.cwd(),
    }));
  }

  // ── Internal ─────────────────────────────────────────────

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority]);
  }

  private drain(): void {
    while (this.active.size < this.config.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.executeTask(entry);
    }
  }

  private async executeTask(entry: QueueEntry): Promise<void> {
    const { task, resolve, reject } = entry;
    const startedAt = Date.now();
    this.active.set(task.id, { task, startedAt });
    task.status = "running";
    task.startedAt = new Date();

    try {
      const backend = this.selectBackend(task);
      if (!backend) {
        throw new Error(`No backend available for model ${task.model}`);
      }

      const prompt = task.systemPrompt
        ? `<system>${task.systemPrompt}</system>\n\n${task.prompt}`
        : task.prompt;

      const result = await backend.execute(prompt, {
        model: task.model,
        allowedTools: task.allowedTools,
        cwd: task.worktreePath,
      });

      task.status = "completed";
      task.result = result.content;
      task.completedAt = new Date();
      this.stats.completed++;
      this.stats.totalDurationMs += Date.now() - startedAt;

      resolve(result.content);
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = new Date();
      this.stats.failed++;
      this.stats.totalDurationMs += Date.now() - startedAt;

      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.active.delete(task.id);
      this.drain(); // fill the slot
    }
  }

  private selectBackend(task: HiveTask): Backend | null {
    // Try preferred backend first
    const preferred = this.config.preferredBackend;
    if (this.backends[preferred]) {
      this.backendUsage[preferred]++;
      return this.backends[preferred]!;
    }

    // Try model-specific backend
    const modelBackend = this.config.modelTiering[task.model];
    if (this.backends[modelBackend]) {
      this.backendUsage[modelBackend]++;
      return this.backends[modelBackend]!;
    }

    // Fallback: any available backend
    for (const [type, backend] of Object.entries(this.backends)) {
      if (backend) {
        this.backendUsage[type as BackendType]++;
        return backend;
      }
    }

    return null;
  }
}
