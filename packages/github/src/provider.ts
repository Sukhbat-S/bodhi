// ============================================================
// BODHI — GitHub Context Provider
// Injects GitHub activity into agent prompts
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { GitHubService } from "./service.js";

const GITHUB_KEYWORDS = [
  "github", "commit", "commits", "pr", "pull request", "pull requests",
  "issue", "issues", "repo", "repository", "repositories",
  "merge", "branch", "branches", "code review",
  "release", "tag", "deploy",
  "briefing", "morning", "evening", "weekly",
];

export class GitHubContextProvider implements ContextProvider {
  name = "github";
  priority = 6;

  private githubService: GitHubService;

  constructor(githubService: GitHubService) {
    this.githubService = githubService;
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
      const summary = await this.githubService.getBriefingSummary();

      if (!summary) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const content = `GitHub activity:\n${summary}`;
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[github-context] Failed to gather:",
        error instanceof Error ? error.message : error
      );
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();

    // Briefing prompts always get GitHub context
    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening") || lower.includes("weekly")) {
      return 0.85;
    }

    // Direct GitHub mentions
    if (lower.includes("github")) {
      return 0.95;
    }

    // Check keyword matches
    const matches = GITHUB_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.8;
    if (matches.length === 1) return 0.5;

    return 0.1;
  }
}
