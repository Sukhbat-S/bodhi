// ============================================================
// BODHI — Memory Context Provider
// Implements ContextProvider to inject memories into prompts
// Combines semantic search + recent high-importance memories
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { MemoryService } from "./service.js";

const TOTAL_MEMORY_CAP = 25;

export class MemoryContextProvider implements ContextProvider {
  name = "memory";
  priority = 10;

  private memoryService: MemoryService;

  constructor(memoryService: MemoryService) {
    this.memoryService = memoryService;
  }

  async gather(message?: string): Promise<ContextFragment> {
    if (!message) {
      return {
        provider: this.name,
        content: "",
        tokenEstimate: 0,
        relevance: 0,
      };
    }

    // Fetch semantic matches and recent high-importance memories in parallel
    const [semanticMemories, recentMemories] = await Promise.all([
      this.memoryService.retrieve(message, 15),
      this.memoryService.getRecentMemories(12),
    ]);

    // Dedup by ID — semantic results take priority (more relevant)
    const seenIds = new Set<string>();
    const combined = [];

    for (const m of semanticMemories) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        combined.push(m);
      }
    }

    for (const m of recentMemories) {
      if (!seenIds.has(m.id) && combined.length < TOTAL_MEMORY_CAP) {
        seenIds.add(m.id);
        combined.push(m);
      }
    }

    if (combined.length === 0) {
      return {
        provider: this.name,
        content: "",
        tokenEstimate: 0,
        relevance: 0,
      };
    }

    // Build formatted output with two sections
    const sections: string[] = [];

    // Section 1: Semantic matches (relevant to this message)
    const semantic = combined.filter((m) => m.similarity > 0);
    if (semantic.length > 0) {
      sections.push("Relevant memories:");
      for (const m of semantic) {
        const age = formatAge(m.createdAt);
        sections.push(
          `- [${m.type}] ${m.content} (${age}, relevance: ${(m.similarity * 100).toFixed(0)}%)`
        );
      }
    }

    // Section 2: Recent important memories (not already in semantic)
    const recentOnly = combined.filter((m) => m.similarity === 0);
    if (recentOnly.length > 0) {
      sections.push("\nRecent important context:");
      for (const m of recentOnly) {
        const age = formatAge(m.createdAt);
        sections.push(`- [${m.type}] ${m.content} (${age})`);
      }
    }

    const content =
      "Your memories (USE THESE — don't ask what you already know):\n" +
      sections.join("\n");

    // Rough token estimate: ~4 chars per token
    const tokenEstimate = Math.ceil(content.length / 4);

    return {
      provider: this.name,
      content,
      tokenEstimate,
      relevance: 0.9,
      metadata: { memoryIds: combined.map((m) => m.id) },
    };
  }

  relevance(_message: string): number {
    return 0.9;
  }
}

function formatAge(date: Date | string): string {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
