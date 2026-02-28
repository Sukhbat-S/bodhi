// ============================================================
// BODHI — Project Knowledge Config
// Defines which projects' CLAUDE.md + MEMORY.md to read
// ============================================================

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
 * Default projects — hardcoded for now.
 * Could be loaded from a JSON config file or env var later.
 */
export const DEFAULT_PROJECTS: ProjectEntry[] = [
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
