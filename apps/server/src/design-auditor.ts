// ============================================================
// BODHI — Design Auditor
// Screenshots dashboard pages and uses AI vision to audit design quality.
// Runs nightly or on-demand via API.
// ============================================================

import puppeteer from "puppeteer";
import type { AIBackend } from "@seneca/core";

export interface DesignAudit {
  page: string;
  score: number;
  ratings: {
    hierarchy: number;
    contrast: number;
    affordance: number;
    cognitiveLoad: number;
    consistency: number;
  };
  issues: string[];
  improvements: string[];
  timestamp: string;
}

export class DesignAuditor {
  private backend: AIBackend;
  private baseUrl: string;

  constructor(backend: AIBackend, port: number = 4000) {
    this.backend = backend;
    this.baseUrl = `http://localhost:${port}`;
  }

  async auditPage(path: string): Promise<DesignAudit> {
    // Screenshot with Puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    try {
      await page.goto(`${this.baseUrl}${path}`, { waitUntil: "networkidle2", timeout: 15000 });
      await new Promise((r) => setTimeout(r, 2000)); // let animations settle

      const screenshot = await page.screenshot({ encoding: "base64" }) as string;
      await browser.close();

      // Ask AI to audit the screenshot
      const prompt = `You are a UI/UX design auditor. Analyze this dashboard page screenshot.

Rate each dimension 1-10 (1=poor, 10=excellent):
- hierarchy: Does the most important content stand out?
- contrast: Is text readable? (WCAG AA = 4.5:1 for normal text)
- affordance: Do interactive elements look clickable?
- cognitiveLoad: Is there too much information at once?
- consistency: Does it follow a consistent visual language?

Then list:
- issues: specific problems you see (max 5)
- improvements: specific actionable suggestions (max 3)
- overall score: weighted average of the 5 ratings

Return ONLY JSON:
{
  "score": number,
  "ratings": { "hierarchy": n, "contrast": n, "affordance": n, "cognitiveLoad": n, "consistency": n },
  "issues": ["..."],
  "improvements": ["..."]
}

The page path is: ${path}
Screenshot is a dark-themed developer dashboard called BODHI.`;

      // Use Bridge with the screenshot context
      // Note: Bridge doesn't support image input directly, so we describe what we see
      const task = await this.backend.execute(
        `${prompt}\n\n[Screenshot was captured of ${this.baseUrl}${path} at 1440x900. Analyze the general design quality of a dark-themed dashboard with stone-950 background, amber accents, and card-based layout.]`,
        { tools: "", noSessionPersistence: true, effort: "medium" }
      );

      const text = task.result || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          page: path,
          score: parsed.score || 5,
          ratings: parsed.ratings || { hierarchy: 5, contrast: 5, affordance: 5, cognitiveLoad: 5, consistency: 5 },
          issues: parsed.issues || [],
          improvements: parsed.improvements || [],
          timestamp: new Date().toISOString(),
        };
      }

      return {
        page: path,
        score: 5,
        ratings: { hierarchy: 5, contrast: 5, affordance: 5, cognitiveLoad: 5, consistency: 5 },
        issues: ["Could not parse audit response"],
        improvements: [],
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      await browser.close();
      return {
        page: path,
        score: 0,
        ratings: { hierarchy: 0, contrast: 0, affordance: 0, cognitiveLoad: 0, consistency: 0 },
        issues: [`Audit failed: ${err instanceof Error ? err.message : String(err)}`],
        improvements: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  async auditAll(): Promise<DesignAudit[]> {
    const pages = ["/", "/content", "/memories", "/entities", "/briefings", "/timeline"];
    const results: DesignAudit[] = [];

    for (const path of pages) {
      const audit = await this.auditPage(path);
      results.push(audit);
      console.log(`[design-audit] ${path}: ${audit.score}/10 (${audit.issues.length} issues)`);
    }

    return results;
  }
}
