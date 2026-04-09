export { HiveEngine, type HiveEvent } from "./engine.js";
export { AgentPool } from "./pool.js";
export { DAGScheduler } from "./dag.js";
export { HiveWitness, type WitnessAlert } from "./witness.js";
export { runAutoChecks, runContainmentChecks, formatResults } from "./verification.js";
export { recordTaskResult, getProfiles, getProfileSummary, loadProfiles, storeLesson, getLessons } from "./agent-memory.js";
export { createSDKBackend, executeViaSDK } from "./sdk-backend.js";
export { ROLES, getRole } from "./roles/index.js";
export type {
  HiveTask,
  Mission,
  MissionBudget,
  HiveMetrics,
  AgentRole,
  AgentProfile,
  RoleDefinition,
  Priority,
  TaskStatus,
  MissionStatus,
  BackendType,
  ModelTier,
  PoolConfig,
} from "./types.js";
