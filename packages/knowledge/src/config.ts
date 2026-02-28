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
 * Default projects — filtered to only include paths that exist on disk.
 * On a VPS where local project directories don't exist, these are simply skipped.
 */
const ALL_PROJECTS: ProjectEntry[] = [
  {
    name: "jewelry",
    path: "/Users/macbookpro/Documents/jewelry-platform",
    keywords: [
      "jewelry", "zuusgel", "shigtgee", "ecommerce", "store",
      "product", "order", "checkout", "deploy", "vercel",
      "admin", "qpay", "payment", "supabase", "rls",
      "campaign", "coupon", "loyalty", "quiz", "stone",
      "category", "cart", "wishlist", "review", "notification",
      "multi-brand", "brand",
    ],
    memoryMdPath:
      "/Users/macbookpro/.claude/projects/-Users-macbookpro-Documents-jewelry-platform/memory/MEMORY.md",
  },
  {
    name: "bodhi",
    path: "/Users/macbookpro/Documents/bodhi",
    keywords: [
      "bodhi", "bridge", "telegram", "bot", "memory",
      "context", "scheduler", "briefing", "agent", "mcp",
      "persona", "conversation", "dashboard", "hono",
      "voyage", "embedding", "pgvector", "knowledge",
    ],
    memoryMdPath:
      "/Users/macbookpro/.claude/projects/-Users-macbookpro-Documents-bodhi/memory/MEMORY.md",
  },
];

// Only include projects whose root path exists on this machine
export const DEFAULT_PROJECTS: ProjectEntry[] = ALL_PROJECTS.filter((p) => {
  try {
    fs.accessSync(p.path);
    return true;
  } catch {
    return false;
  }
});
