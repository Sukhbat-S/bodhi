// ============================================================
// BODHI — Gmail Context Provider
// Injects inbox data into agent prompts when relevant
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { GmailService } from "./gmail-service.js";

const GMAIL_KEYWORDS = [
  "email", "emails", "mail", "inbox",
  "unread", "message", "messages",
  "gmail", "sent", "received",
  "briefing", "morning", "evening", "weekly",
];

export class GmailContextProvider implements ContextProvider {
  name = "gmail";
  priority = 7;

  private gmailService: GmailService;

  constructor(gmailService: GmailService) {
    this.gmailService = gmailService;
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
      const summary = await this.gmailService.getBriefingSummary();

      if (!summary) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const content = `Gmail inbox:\n${summary}`;
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[gmail-context] Failed to gather:",
        error instanceof Error ? error.message : error
      );
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();

    // Briefing prompts always get Gmail context
    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening") || lower.includes("weekly")) {
      return 0.85;
    }

    // Direct Gmail/email mentions
    if (lower.includes("gmail") || lower.includes("inbox")) {
      return 0.95;
    }

    // Check keyword matches
    const matches = GMAIL_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.8;
    if (matches.length === 1) return 0.5;

    return 0.1;
  }
}
