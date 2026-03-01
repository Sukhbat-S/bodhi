// ============================================================
// BODHI — Insight Generator
// Detects patterns from memory data via SQL aggregation
// No AI calls — pure database analysis for speed
// ============================================================

import type { MemoryService } from "./service.js";

export interface Insight {
  type: "trend" | "stalled" | "neglected" | "activity";
  text: string;
}

export class InsightGenerator {
  private memoryService: MemoryService;

  constructor(memoryService: MemoryService) {
    this.memoryService = memoryService;
  }

  /**
   * Generate all insights. Returns plain-text observations
   * that can be injected into scheduler briefing prompts.
   */
  async generate(): Promise<Insight[]> {
    const insights: Insight[] = [];

    const [trends, stalled, neglected, activity] = await Promise.all([
      this.detectTagTrends(),
      this.detectStalledDecisions(),
      this.detectNeglectedKnowledge(),
      this.detectActivityTrends(),
    ]);

    insights.push(...trends, ...stalled, ...neglected, ...activity);
    return insights;
  }

  /**
   * Compare tag frequency: last 7 days vs previous 7 days.
   * Surfaces what topics are growing or fading.
   */
  private async detectTagTrends(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const trends = await this.memoryService.getTagTrends(7, 7);

    for (const t of trends) {
      if (t.recent > 0 && t.previous === 0) {
        insights.push({
          type: "trend",
          text: `New topic emerging: "${t.tag}" appeared ${t.recent} time${t.recent > 1 ? "s" : ""} this week (not seen before).`,
        });
      } else if (t.recent >= t.previous * 2 && t.previous > 0) {
        insights.push({
          type: "trend",
          text: `"${t.tag}" activity doubled: ${t.previous} → ${t.recent} mentions this week.`,
        });
      } else if (t.recent === 0 && t.previous > 2) {
        insights.push({
          type: "trend",
          text: `"${t.tag}" went silent: ${t.previous} mentions last week → 0 this week.`,
        });
      }
    }

    return insights.slice(0, 3); // Cap at 3 trend insights
  }

  /**
   * Find decisions made but never revisited.
   */
  private async detectStalledDecisions(): Promise<Insight[]> {
    const stalled = await this.memoryService.getStalledDecisions(7, 2);
    if (stalled.length === 0) return [];

    const insights: Insight[] = [];

    if (stalled.length === 1) {
      const d = stalled[0];
      const age = daysSince(d.createdAt);
      insights.push({
        type: "stalled",
        text: `Unreviewed decision (${age}d ago): "${truncate(d.content, 80)}"`,
      });
    } else {
      insights.push({
        type: "stalled",
        text: `${stalled.length} decisions made but never revisited. Top: "${truncate(stalled[0].content, 60)}"`,
      });
    }

    return insights;
  }

  /**
   * Find high-importance memories that are never retrieved.
   */
  private async detectNeglectedKnowledge(): Promise<Insight[]> {
    const neglected = await this.memoryService.getNeglectedHighValue(0.7, 0, 14);
    if (neglected.length === 0) return [];

    return [{
      type: "neglected",
      text: `${neglected.length} high-value memor${neglected.length === 1 ? "y" : "ies"} stored but never retrieved. Example: "${truncate(neglected[0].content, 60)}"`,
    }];
  }

  /**
   * Compare memory creation rate: this week vs last week.
   */
  private async detectActivityTrends(): Promise<Insight[]> {
    const [recent, previous] = await Promise.all([
      this.memoryService.getCreationRate(7),
      this.memoryService.getCreationRate(14).then(async (total) => {
        const recentCount = await this.memoryService.getCreationRate(7);
        return total - recentCount;
      }),
    ]);

    if (previous === 0 && recent === 0) return [];

    if (previous === 0 && recent > 0) {
      return [{
        type: "activity",
        text: `First week of activity: ${recent} memories created.`,
      }];
    }

    const ratio = recent / Math.max(previous, 1);

    if (ratio >= 2) {
      return [{
        type: "activity",
        text: `Memory creation rate doubled: ${previous} last week → ${recent} this week.`,
      }];
    } else if (ratio <= 0.5 && previous >= 5) {
      return [{
        type: "activity",
        text: `Activity dropped: ${previous} memories last week → ${recent} this week.`,
      }];
    }

    return [];
  }
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
