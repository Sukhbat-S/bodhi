// ============================================================
// BODHI — Notion Context Provider
// Injects Notion tasks & session data into agent prompts
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { NotionService } from "./service.js";

// Keywords that indicate Notion data is relevant
const NOTION_KEYWORDS = [
  "task", "tasks", "todo", "to-do", "to do",
  "session", "sessions", "dev session",
  "notion", "project", "projects",
  "jewelry", "shigtgee", "platform",
  "what did i do", "what am i working on",
  "pending", "in progress", "status",
  "today", "this week", "recent",
  "briefing", "morning", "evening", "weekly",
];

export class NotionContextProvider implements ContextProvider {
  name = "notion";
  priority = 8; // Below memory (10) but still high

  private notionService: NotionService;

  constructor(notionService: NotionService) {
    this.notionService = notionService;
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
      const summary = await this.notionService.getBriefingSummary();

      if (!summary) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const content = `Notion workspace data:\n${summary}`;
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[notion-context] Failed to gather:",
        error instanceof Error ? error.message : error
      );
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();

    // Briefing prompts always get Notion context
    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening") || lower.includes("weekly")) {
      return 0.85;
    }

    // Direct Notion mentions
    if (lower.includes("notion")) {
      return 0.95;
    }

    // Check keyword matches
    const matches = NOTION_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.8;
    if (matches.length === 1) return 0.5;

    // Default: low relevance (don't inject Notion data for unrelated questions)
    return 0.1;
  }
}
