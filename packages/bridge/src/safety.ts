// ============================================================
// BODHI — Bridge Safety Layer
// Budget caps, tool allowlists, and confirmation logic
// ============================================================

import type { BridgeOptions, ProjectConfig } from "@seneca/core";

// Known projects and their default configs
const PROJECTS: Record<string, ProjectConfig> = {
  "jewelry-platform": {
    name: "ЗҮҮСГЭЛ",
    path: "/Users/macbookpro/Documents/jewelry-platform",
    description: "Jewelry e-commerce platform",
    defaultBranch: "main",
    allowedTools: ["Read", "Edit", "Bash", "Grep", "Glob", "Write"],
    maxBudgetUsd: 5,
  },
};

// Actions that require explicit confirmation via Telegram inline keyboard
const DANGEROUS_PATTERNS = [
  /git\s+push/i,
  /git\s+push\s+--force/i,
  /git\s+reset\s+--hard/i,
  /rm\s+-rf/i,
  /drop\s+table/i,
  /vercel\s+--prod/i,
  /npx\s+supabase\s+db\s+reset/i,
  /DELETE\s+FROM/i,
];

export function resolveProject(nameOrPath: string): ProjectConfig | null {
  // Check by name
  const byName = PROJECTS[nameOrPath.toLowerCase()];
  if (byName) return byName;

  // Check by path
  for (const project of Object.values(PROJECTS)) {
    if (nameOrPath.startsWith(project.path)) return project;
  }

  return null;
}

export function getProjectOptions(project: ProjectConfig): Partial<BridgeOptions> {
  return {
    cwd: project.path,
    allowedTools: project.allowedTools,
    maxBudgetUsd: project.maxBudgetUsd,
  };
}

export function requiresConfirmation(prompt: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function validateBudget(usd: number): boolean {
  // Hard cap at $10 per task
  return usd > 0 && usd <= 10;
}

export function addProject(key: string, config: ProjectConfig): void {
  PROJECTS[key] = config;
}

export function listProjects(): ProjectConfig[] {
  return Object.values(PROJECTS);
}
