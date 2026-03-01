// ============================================================
// BODHI — Vercel Context Provider
// Injects deployment status into agent prompts
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { VercelService } from "./service.js";

const VERCEL_KEYWORDS = [
  "vercel", "deploy", "deployment", "deployments",
  "build", "production", "preview", "hosting",
  "site", "website", "frontend", "live",
  "briefing", "morning", "evening", "weekly",
];

export class VercelContextProvider implements ContextProvider {
  name = "vercel";
  priority = 6;

  private vercelService: VercelService;

  constructor(vercelService: VercelService) {
    this.vercelService = vercelService;
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
      const summary = await this.vercelService.getBriefingSummary();

      if (!summary) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const content = `Vercel deployment status:\n${summary}`;
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[vercel-context] Failed to gather:",
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

    if (lower.includes("vercel")) {
      return 0.95;
    }

    const matches = VERCEL_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.8;
    if (matches.length === 1) return 0.5;

    return 0.1;
  }
}
