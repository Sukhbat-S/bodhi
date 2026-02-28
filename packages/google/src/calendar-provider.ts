// ============================================================
// BODHI — Calendar Context Provider
// Injects schedule data into agent prompts when relevant
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { CalendarService } from "./calendar-service.js";

const CALENDAR_KEYWORDS = [
  "meeting", "meetings", "calendar", "schedule",
  "event", "events", "appointment",
  "today", "tomorrow", "this week",
  "free time", "available", "busy",
  "briefing", "morning", "evening", "weekly",
];

export class CalendarContextProvider implements ContextProvider {
  name = "calendar";
  priority = 7;

  private calendarService: CalendarService;

  constructor(calendarService: CalendarService) {
    this.calendarService = calendarService;
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
      // Determine briefing type from message context
      const lower = message.toLowerCase();
      const type = lower.includes("evening") ? "evening" : "morning";
      const summary = await this.calendarService.getBriefingSummary(type);

      if (!summary) {
        return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
      }

      const content = `Google Calendar:\n${summary}`;
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        "[calendar-context] Failed to gather:",
        error instanceof Error ? error.message : error
      );
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();

    // Briefing prompts always get calendar context
    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening") || lower.includes("weekly")) {
      return 0.85;
    }

    // Direct calendar mentions
    if (lower.includes("calendar") || lower.includes("schedule")) {
      return 0.95;
    }

    // Check keyword matches
    const matches = CALENDAR_KEYWORDS.filter((kw) => lower.includes(kw));
    if (matches.length >= 2) return 0.8;
    if (matches.length === 1) return 0.5;

    return 0.1;
  }
}
