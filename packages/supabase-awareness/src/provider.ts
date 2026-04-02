// ============================================================
// BODHI — Supabase Awareness Context Provider
// Injects Supabase project health into agent prompts
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { SupabaseAwarenessService } from "./service.js";

const SUPABASE_KEYWORDS = [
  "supabase", "database", "db", "migration", "migrations",
  "table", "tables", "postgres", "postgresql",
  "storage", "auth", "rls", "row level security",
  "schema", "infrastructure", "health",
  "briefing", "morning", "evening", "weekly",
];

export class SupabaseAwarenessProvider implements ContextProvider {
  name = "supabase";
  priority = 6;

  private supabaseService: SupabaseAwarenessService;

  constructor(supabaseService: SupabaseAwarenessService) {
    this.supabaseService = supabaseService;
  }

  async gather(message?: string): Promise<ContextFragment> {
    if (!message) {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }

    const rel = this.relevance(message);
    if (rel < 0.3) {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }

    try {
      const summary = await this.supabaseService.getBriefingSummary();

      if (!summary) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const content = `Supabase project status:\n${summary}`;
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[supabase-context] Failed to gather:",
        error instanceof Error ? error.message : error
      );
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();

    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening") || lower.includes("weekly")) {
      return 0.85;
    }

    if (lower.includes("supabase")) {
      return 0.95;
    }

    const matches = SUPABASE_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.8;
    if (matches.length === 1) return 0.5;

    return 0.1;
  }
}
