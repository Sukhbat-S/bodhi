// ============================================================
// The Hive — Agent Memory
// Tracks per-role performance profiles. Agents learn from
// past missions — strengths, weaknesses, success rates.
// ============================================================

import type { AgentProfile, AgentRole, HiveTask } from "./types.js";

interface MemoryService {
  search(query: string, limit?: number): Promise<{ content: string }[]>;
  store(memory: { content: string; type: string; tags?: string[]; importance?: number }): Promise<string>;
}

/** In-memory cache of agent profiles, synced to MemoryService. */
const profileCache = new Map<string, AgentProfile>();

/**
 * Record a task result and update the agent's profile.
 */
export async function recordTaskResult(
  task: HiveTask,
  memoryService?: MemoryService,
): Promise<void> {
  const key = profileKey(task.role, task.assignedAgent);
  let profile = profileCache.get(key) || createProfile(task.role, task.assignedAgent);

  const succeeded = task.status === "completed";
  const duration = task.startedAt && task.completedAt
    ? task.completedAt.getTime() - task.startedAt.getTime()
    : 0;

  profile.totalTasks++;
  profile.successRate = ((profile.successRate * (profile.totalTasks - 1)) + (succeeded ? 1 : 0)) / profile.totalTasks;
  profile.avgDurationMs = ((profile.avgDurationMs * (profile.totalTasks - 1)) + duration) / profile.totalTasks;
  profile.lastActive = new Date();

  // Track strengths/weaknesses from task errors
  if (!succeeded && task.error) {
    const weakness = extractPattern(task.error);
    if (weakness && !profile.weaknesses.includes(weakness)) {
      profile.weaknesses.push(weakness);
      if (profile.weaknesses.length > 10) profile.weaknesses.shift();
    }
  }

  profileCache.set(key, profile);

  // Persist to memory service
  if (memoryService) {
    try {
      await memoryService.store({
        content: `Agent profile [${task.role}]: ${profile.totalTasks} tasks, ${(profile.successRate * 100).toFixed(0)}% success, avg ${Math.round(profile.avgDurationMs / 1000)}s. Weaknesses: ${profile.weaknesses.join(", ") || "none"}`,
        type: "fact",
        tags: ["hive", "agent-profile", task.role],
        importance: 0.4,
      });
    } catch {
      // Non-critical
    }
  }
}

/**
 * Get the best agent profile for a given role.
 */
export function getBestProfile(role: AgentRole): AgentProfile | undefined {
  let best: AgentProfile | undefined;
  for (const [, profile] of profileCache) {
    if (profile.role !== role) continue;
    if (!best || profile.successRate > best.successRate) {
      best = profile;
    }
  }
  return best;
}

/**
 * Get all profiles for a given role.
 */
export function getProfiles(role?: AgentRole): AgentProfile[] {
  const all = Array.from(profileCache.values());
  return role ? all.filter((p) => p.role === role) : all;
}

/**
 * Load profiles from memory service on startup.
 */
export async function loadProfiles(memoryService: MemoryService): Promise<number> {
  try {
    const memories = await memoryService.search("agent-profile hive", 20);
    // Profiles are recreated from task results, not parsed from memory text.
    // Memory just serves as a learning signal for the Commander.
    return memories.length;
  } catch {
    return 0;
  }
}

/**
 * Get a summary string of all profiles for Commander context.
 */
export function getProfileSummary(): string {
  const profiles = getProfiles();
  if (profiles.length === 0) return "No agent profiles yet.";

  return profiles
    .map((p) => `- ${p.role}${p.specialization ? `/${p.specialization}` : ""}: ${p.totalTasks} tasks, ${(p.successRate * 100).toFixed(0)}% success${p.weaknesses.length ? `, weak: ${p.weaknesses.join(", ")}` : ""}`)
    .join("\n");
}

// ── Helpers ─────────────────────────────────────

function profileKey(role: AgentRole, specialization?: string): string {
  return specialization ? `${role}:${specialization}` : role;
}

function createProfile(role: AgentRole, specialization?: string): AgentProfile {
  return {
    id: profileKey(role, specialization),
    role,
    specialization,
    totalTasks: 0,
    successRate: 1.0,
    avgDurationMs: 0,
    strengths: [],
    weaknesses: [],
    lastActive: new Date(),
  };
}

function extractPattern(error: string): string | null {
  if (error.includes("tsc") || error.includes("type error")) return "type-errors";
  if (error.includes("timeout")) return "timeout";
  if (error.includes("merge conflict")) return "merge-conflicts";
  if (error.includes("test") && error.includes("fail")) return "test-failures";
  if (error.includes("permission")) return "permissions";
  return null;
}
