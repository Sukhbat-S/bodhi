// ============================================================
// BODHI — Project Knowledge Context Provider
// Reads CLAUDE.md + MEMORY.md from configured projects and
// injects relevant sections into the agent's prompt.
//
// This is Bridge 1 of the Unified Brain architecture:
//   Claude Code's accumulated knowledge → BODHI
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { ProjectEntry } from "./config.js";
import { DEFAULT_PROJECTS } from "./config.js";
import { parseSections, extractRelevant } from "./parser.js";

/** Simple in-memory cache to avoid re-reading files on every message */
interface CacheEntry {
  content: string;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const EMPTY_FRAGMENT: ContextFragment = {
  provider: "projects",
  content: "",
  tokenEstimate: 0,
  relevance: 0,
};

export class ProjectKnowledgeProvider implements ContextProvider {
  name = "projects";
  priority = 9; // Between memory (10) and notion (8)

  private projects: ProjectEntry[];
  private fileCache: Map<string, CacheEntry> = new Map();

  constructor(projects?: ProjectEntry[]) {
    this.projects = projects || DEFAULT_PROJECTS;
  }

  async gather(message?: string): Promise<ContextFragment> {
    if (!message) return EMPTY_FRAGMENT;

    const rel = this.relevance(message);
    if (rel < 0.3) return EMPTY_FRAGMENT;

    // Find the best-matching project
    const match = this.findBestMatch(message);
    if (!match) return EMPTY_FRAGMENT;

    try {
      // Read CLAUDE.md
      const claudeMdPath = match.claudeMdPath || path.join(match.path, "CLAUDE.md");
      const claudeMd = this.readCached(claudeMdPath);

      if (!claudeMd) {
        console.warn(`[knowledge] CLAUDE.md not found: ${claudeMdPath}`);
        return EMPTY_FRAGMENT;
      }

      // Extract relevant sections (not the full 700-line file)
      const sections = extractRelevant(parseSections(claudeMd), message, 1200);

      if (!sections) return EMPTY_FRAGMENT;

      // Read MEMORY.md (optional — may not exist)
      let memoryContent = "";
      if (match.memoryMdPath) {
        const memoryMd = this.readCached(match.memoryMdPath);
        if (memoryMd) {
          // Truncate memory to ~300 tokens (~1200 chars) — it's supplementary
          memoryContent = memoryMd.length > 1200
            ? memoryMd.slice(0, 1200) + "\n...(truncated)"
            : memoryMd;
        }
      }

      // Format the output
      let content = `Project "${match.name}" knowledge:\n\n${sections}`;
      if (memoryContent) {
        content += `\n\n---\n\nCross-session memory (${match.name}):\n${memoryContent}`;
      }

      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        provider: this.name,
        content,
        tokenEstimate,
        relevance: rel,
      };
    } catch (error) {
      console.error(
        `[knowledge] Failed to gather for project "${match.name}":`,
        error instanceof Error ? error.message : error,
      );
      return EMPTY_FRAGMENT;
    }
  }

  relevance(message: string): number {
    const lower = message.toLowerCase();
    let best = 0;

    for (const project of this.projects) {
      // Direct name mention → highest relevance
      if (lower.includes(project.name)) {
        best = Math.max(best, 0.95);
        continue;
      }

      // Count keyword matches
      const matches = project.keywords.filter((kw) => lower.includes(kw));

      if (matches.length >= 3) {
        best = Math.max(best, 0.85);
      } else if (matches.length >= 2) {
        best = Math.max(best, 0.7);
      } else if (matches.length >= 1) {
        best = Math.max(best, 0.4);
      }
    }

    // Briefing prompts get moderate project context
    if (lower.includes("briefing") || lower.includes("morning") || lower.includes("evening")) {
      best = Math.max(best, 0.6);
    }

    return best;
  }

  /**
   * Find the project with the highest keyword match count for the message.
   */
  private findBestMatch(message: string): ProjectEntry | null {
    const lower = message.toLowerCase();
    let bestProject: ProjectEntry | null = null;
    let bestScore = 0;

    for (const project of this.projects) {
      let score = 0;

      // Direct name mention is strongest signal
      if (lower.includes(project.name)) {
        score += 10;
      }

      // Count keyword matches
      for (const kw of project.keywords) {
        if (lower.includes(kw)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestProject = project;
      }
    }

    return bestScore > 0 ? bestProject : null;
  }

  /**
   * Read a file with simple in-memory caching (5-minute TTL).
   * Returns null if the file doesn't exist.
   */
  private readCached(filePath: string): string | null {
    const now = Date.now();
    const cached = this.fileCache.get(filePath);

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.content;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      this.fileCache.set(filePath, { content, timestamp: now });
      return content;
    } catch {
      // File doesn't exist or can't be read
      return null;
    }
  }
}
