// ============================================================
// BODHI — Goal Context Provider
// Injects active goals into every conversation so BODHI always
// thinks about where you're heading. Not just storage — presence.
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { MemoryService } from "./service.js";

export class GoalContextProvider implements ContextProvider {
  name = "goals";
  priority = 9.5; // Just below memory (10), above everything else

  private memoryService: MemoryService;

  constructor(memoryService: MemoryService) {
    this.memoryService = memoryService;
  }

  relevance(): number {
    return 1; // Goals are always relevant
  }

  async gather(): Promise<ContextFragment> {
    try {
      const result = await this.memoryService.listFiltered({ type: "goal", limit: 10 });
      const goals = result.memories;

      if (goals.length === 0) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const lines = goals.map((g) => {
        const age = this.formatAge(g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt));
        return `- ${g.content} (set ${age})`;
      });

      const content = [
        "## Active Goals",
        "",
        "These are goals the user has set. Reference them when relevant — notice progress, drift, or connections to the current conversation. If a goal hasn't been mentioned recently, gently ask about it.",
        "",
        ...lines,
      ].join("\n");

      return {
        provider: this.name,
        content,
        tokenEstimate: lines.length * 20 + 40,
        relevance: 1,
      };
    } catch {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  private formatAge(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return "just now";
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD < 7) return `${diffD}d ago`;
    if (diffD < 30) return `${Math.floor(diffD / 7)}w ago`;
    return `${Math.floor(diffD / 30)}mo ago`;
  }
}
