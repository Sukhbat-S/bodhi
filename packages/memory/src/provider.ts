// ============================================================
// BODHI — Memory Context Provider
// Implements ContextProvider to inject memories into prompts
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { MemoryService } from "./service.js";

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

    const memories = await this.memoryService.retrieve(message, 8);

    if (memories.length === 0) {
      return {
        provider: this.name,
        content: "",
        tokenEstimate: 0,
        relevance: 0,
      };
    }

    // Format memories for the system prompt
    const lines = memories.map((m) => {
      const age = formatAge(m.createdAt);
      const icon =
        m.type === "decision"
          ? "decision"
          : m.type === "pattern"
            ? "pattern"
            : m.type === "preference"
              ? "preference"
              : m.type === "event"
                ? "event"
                : "fact";
      return `- [${icon}] ${m.content} (${age}, relevance: ${(m.similarity * 100).toFixed(0)}%)`;
    });

    const content =
      "Relevant memories from past conversations:\n" + lines.join("\n");

    // Rough token estimate: ~4 chars per token
    const tokenEstimate = Math.ceil(content.length / 4);

    return {
      provider: this.name,
      content,
      tokenEstimate,
      relevance: 0.9,
    };
  }

  relevance(_message: string): number {
    return 0.9;
  }
}

function formatAge(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
