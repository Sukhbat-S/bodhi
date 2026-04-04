// ============================================================
// BODHI — Entity Context Provider
// Injects entity relationships into prompts when relevant
// ============================================================

import type { ContextProvider, ContextFragment } from "@seneca/core";
import type { EntityService } from "./entity-service.js";

export class EntityContextProvider implements ContextProvider {
  name = "entities";
  priority = 8; // Below memory (10), above gmail/calendar (7)

  private entityService: EntityService;

  constructor(entityService: EntityService) {
    this.entityService = entityService;
  }

  async gather(message?: string): Promise<ContextFragment> {
    if (!message) {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }

    // Search for entity names mentioned in the message
    const { entities } = await this.entityService.list({ limit: 100 });
    if (entities.length === 0) {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }

    const msgLower = message.toLowerCase();
    const matched = entities.filter((e) => {
      if (msgLower.includes(e.name.toLowerCase())) return true;
      if (e.aliases?.some((a) => msgLower.includes(a.toLowerCase()))) return true;
      return false;
    });

    if (matched.length === 0) {
      return { provider: this.name, content: "", tokenEstimate: 0, relevance: 0 };
    }

    // Build entity context with relationships
    const lines: string[] = ["Entity context (people, projects, topics you've discussed):"];

    for (const entity of matched.slice(0, 5)) {
      const detail = await this.entityService.getEntity(entity.id);
      if (!detail) continue;

      let line = `- ${entity.type}: ${entity.name} (${entity.mentionCount} mentions`;
      if (detail.relatedEntities.length > 0) {
        const related = detail.relatedEntities
          .slice(0, 3)
          .map((re) => `${re.name}`)
          .join(", ");
        line += `, connected to: ${related}`;
      }
      line += ")";

      // Add most recent memory for context
      if (detail.memories.length > 0) {
        const recentMemory = detail.memories[0];
        const age = formatAge(recentMemory.createdAt);
        line += `\n  Latest: "${recentMemory.content}" (${age})`;
      }

      lines.push(line);
    }

    const content = lines.join("\n");
    const tokenEstimate = Math.ceil(content.length / 4);

    return {
      provider: this.name,
      content,
      tokenEstimate,
      relevance: 0.75,
    };
  }

  relevance(_message: string): number {
    return 0.75;
  }
}

function formatAge(date: Date | string): string {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}
