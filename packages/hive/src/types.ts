// ============================================================
// The Hive — Type Definitions
// Memory-powered agent swarm for BODHI
// ============================================================

export type AgentRole = "commander" | "scout" | "builder" | "sentinel" | "witness" | "merger";
export type Priority = "critical" | "high" | "normal" | "background";
export type TaskStatus = "pending" | "queued" | "running" | "completed" | "failed" | "cancelled";
export type MissionStatus = "planning" | "executing" | "completed" | "failed" | "cancelled";
export type BackendType = "sdk" | "bridge" | "api";
export type ModelTier = "opus" | "sonnet" | "haiku" | "mythos";

export interface HiveTask {
  id: string;
  missionId: string;
  role: AgentRole;
  model: ModelTier;
  prompt: string;
  systemPrompt?: string;
  allowedTools?: string[];
  dependsOn: string[];        // task IDs that must complete first
  priority: Priority;
  status: TaskStatus;
  result?: string;
  error?: string;
  worktreePath?: string;
  startedAt?: Date;
  completedAt?: Date;
  /** Number of auto-repair attempts */
  repairAttempts: number;
  /** Agent profile ID for memory-powered assignment */
  assignedAgent?: string;
}

export interface MissionBudget {
  /** Max tasks the Commander can decompose into (default 20) */
  maxTasks: number;
  /** Max total mission duration in ms (default 30min) */
  maxDurationMs: number;
}

export interface Mission {
  id: string;
  goal: string;
  status: MissionStatus;
  tasks: HiveTask[];
  budget: MissionBudget;
  createdAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

export interface HiveMetrics {
  poolSize: number;
  activeWorkers: number;
  queueDepth: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
  throughputPerHour: number;
  memoryUsageMb: number;
  backendUsage: Record<BackendType, number>;
}

export interface AgentProfile {
  id: string;
  role: AgentRole;
  specialization?: string;    // e.g., "react", "api", "database"
  totalTasks: number;
  successRate: number;
  avgDurationMs: number;
  strengths: string[];
  weaknesses: string[];
  lastActive: Date;
}

export interface RoleDefinition {
  role: AgentRole;
  defaultModel: ModelTier;
  systemPrompt: string;
  allowedTools: string[];
  canSpawnSubAgents: boolean;
  memoryProfile: {
    /** What types of memories to store from this agent's work */
    storeTypes: string[];
    /** What to search for before starting */
    preloadQuery?: string;
  };
}

export interface PoolConfig {
  maxConcurrent: number;
  preferredBackend: BackendType;
  modelTiering: Record<ModelTier, BackendType>;
}
