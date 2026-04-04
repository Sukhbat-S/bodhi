// ============================================================
// BODHI — Entity Backfill
// Extract entities from existing memories retroactively
// ============================================================

import type { AIBackend } from "@seneca/core";
import type { Database } from "@seneca/db";
import { memories } from "@seneca/db";
import { desc, sql } from "drizzle-orm";
import { EntityService, type EntityType } from "./entity-service.js";

const BACKFILL_PROMPT = `You are an entity extraction system. Given a batch of memories, extract the named entities (people, projects, organizations, topics, places) mentioned in each.

Rules:
- Only extract SPECIFIC named entities (not generic concepts like "AI" or "code")
- Use canonical names (e.g., "John Smith" not "John")
- Each entity must have: name, type (person|project|topic|organization|place)
- Link each entity to the memory IDs where it appears
- If a memory mentions no entities, skip it

Return a JSON object:
{
  "entities": [
    {"name": "John Smith", "type": "person", "memoryIds": ["id1", "id2"]},
    {"name": "BODHI", "type": "project", "memoryIds": ["id1"]}
  ]
}

If no entities found: {"entities": []}`;

export class EntityBackfill {
  private backend: AIBackend;
  private entityService: EntityService;
  private db: Database;
  private running = false;

  constructor(db: Database, backend: AIBackend, entityService: EntityService) {
    this.db = db;
    this.backend = backend;
    this.entityService = entityService;
  }

  isRunning(): boolean {
    return this.running;
  }

  async run(): Promise<{ processed: number; entitiesFound: number; linked: number }> {
    if (this.running) throw new Error("Backfill already running");
    this.running = true;

    let processed = 0;
    let entitiesFound = 0;
    let linked = 0;

    try {
      // Load all memories
      const allMemories = await this.db
        .select({ id: memories.id, content: memories.content })
        .from(memories)
        .where(sql`confidence > 0.1`)
        .orderBy(desc(memories.createdAt));

      const batchSize = 20;
      const totalBatches = Math.ceil(allMemories.length / batchSize);

      for (let i = 0; i < allMemories.length; i += batchSize) {
        const batch = allMemories.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        try {
          const memoryList = batch
            .map((m) => `[${m.id}] ${m.content}`)
            .join("\n");

          const prompt = `<system>
${BACKFILL_PROMPT}

IMPORTANT: Respond ONLY with the JSON object. Do NOT use any tools.
</system>

Memories:
${memoryList}`;

          const task = await this.backend.execute(prompt, {
            model: "sonnet",
            tools: "",
            noSessionPersistence: true,
          });

          const text = task.result || task.error || "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.log(`[backfill] Batch ${batchNum}/${totalBatches}: no JSON returned`);
            processed += batch.length;
            continue;
          }

          const parsed = JSON.parse(jsonMatch[0]);
          const extractedEntities = parsed.entities || [];

          for (const ent of extractedEntities) {
            if (!ent.name || !ent.type) continue;

            const entity = await this.entityService.findOrCreate(
              ent.name,
              ent.type as EntityType
            );
            entitiesFound++;

            for (const memId of ent.memoryIds || []) {
              // Verify memory ID exists in this batch
              if (batch.some((m) => m.id === memId)) {
                await this.entityService.linkToMemory(entity.id, memId);
                linked++;
              }
            }
          }

          processed += batch.length;
          console.log(
            `[backfill] Batch ${batchNum}/${totalBatches}: ${extractedEntities.length} entities from ${batch.length} memories`
          );
        } catch (err) {
          console.error(
            `[backfill] Batch ${batchNum} failed:`,
            err instanceof Error ? err.message : err
          );
          processed += batch.length;
        }

        // Rate limit between batches
        if (i + batchSize < allMemories.length) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } finally {
      this.running = false;
    }

    console.log(
      `[backfill] Complete: ${processed} memories processed, ${entitiesFound} entities found, ${linked} links created`
    );
    return { processed, entitiesFound, linked };
  }
}
