// ============================================================
// BODHI — Project Knowledge Config
// Defines which projects' CLAUDE.md + MEMORY.md to read
// ============================================================

import * as fs from "node:fs";

export interface ProjectEntry {
  /** Display name: "jewelry", "bodhi" */
  name: string;
  /** Absolute path to project root */
  path: string;
  /** Trigger words for relevance matching */
  keywords: string[];
  /** Override CLAUDE.md location (defaults to {path}/CLAUDE.md) */
  claudeMdPath?: string;
  /** Override MEMORY.md location */
  memoryMdPath?: string;
}

/**
 * Build project list from environment + auto-detected paths.
 * On a VPS where local project directories don't exist, these are simply skipped.
 *
 * Configure via environment variables:
 *   BODHI_DIR             — path to BODHI repo (auto-detected from cwd if not set)
 *   BODHI_EXTRA_PROJECTS  — JSON array of additional ProjectEntry objects
 */
function buildProjectList(): ProjectEntry[] {
  const projects: ProjectEntry[] = [];

  // BODHI itself — use env var or auto-detect
  const bodhiPath = process.env.BODHI_DIR || process.cwd();
  projects.push({
    name: "bodhi",
    path: bodhiPath,
    keywords: [
      "bodhi", "bridge", "telegram", "bot", "memory",
      "context", "scheduler", "briefing", "agent", "mcp",
      "persona", "conversation", "dashboard", "hono",
      "voyage", "embedding", "pgvector", "knowledge",
    ],
  });

  // Additional projects from environment
  const extraJson = process.env.BODHI_EXTRA_PROJECTS;
  if (extraJson) {
    try {
      const extra: ProjectEntry[] = JSON.parse(extraJson);
      projects.push(...extra);
    } catch {
      console.error("[knowledge] Failed to parse BODHI_EXTRA_PROJECTS");
    }
  }

  return projects;
}

// Only include projects whose root path exists on this machine
export const DEFAULT_PROJECTS: ProjectEntry[] = buildProjectList().filter((p) => {
  try {
    fs.accessSync(p.path);
    return true;
  } catch {
    return false;
  }
});
