// ============================================================
// BODHI — Entity Service
// Track people, projects, topics linked to memories
// ============================================================

import { eq, desc, sql, and, or } from "drizzle-orm";
import { entities, entityMemories, memories } from "@seneca/db";
import type { Database } from "@seneca/db";

export type EntityType = "person" | "project" | "topic" | "organization" | "place";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[] | null;
  description: string | null;
  importance: number;
  mentionCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface EntityWithRelations extends Entity {
  memories: Array<{
    id: string;
    content: string;
    type: string;
    importance: number;
    createdAt: Date;
    role: string | null;
  }>;
  relatedEntities: Array<Entity & { sharedMemoryCount: number }>;
}

export interface EntityGraphData {
  nodes: Array<Entity>;
  edges: Array<{
    sourceId: string;
    targetId: string;
    sharedMemoryCount: number;
  }>;
}

export class EntityService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async findOrCreate(
    name: string,
    type: EntityType,
    aliases?: string[]
  ): Promise<Entity> {
    // 1. Exact name match (case-insensitive)
    const byName = await this.db
      .select()
      .from(entities)
      .where(sql`LOWER(name) = LOWER(${name})`)
      .limit(1);

    if (byName.length > 0) {
      // Optionally add new alias
      if (aliases?.length) {
        const existing = (byName[0].aliases as string[]) || [];
        const newAliases = aliases.filter(
          (a) => !existing.some((e) => e.toLowerCase() === a.toLowerCase())
        );
        if (newAliases.length > 0) {
          await this.db
            .update(entities)
            .set({ aliases: [...existing, ...newAliases], updatedAt: new Date() })
            .where(eq(entities.id, byName[0].id));
        }
      }
      return this.toEntity(byName[0]);
    }

    // 2. Alias match — check if input name appears in any entity's aliases
    const byAlias = await this.db
      .select()
      .from(entities)
      .where(sql`aliases @> ${JSON.stringify([name])}::jsonb`)
      .limit(1);

    if (byAlias.length > 0) {
      return this.toEntity(byAlias[0]);
    }

    // 3. No match — create new entity
    const [created] = await this.db
      .insert(entities)
      .values({
        name,
        type,
        aliases: aliases || [],
      })
      .returning();

    return this.toEntity(created);
  }

  async linkToMemory(
    entityId: string,
    memoryId: string,
    role?: string
  ): Promise<void> {
    // Upsert — ignore if link already exists
    await this.db
      .insert(entityMemories)
      .values({ entityId, memoryId, role })
      .onConflictDoNothing();

    // Increment mention count + update lastSeenAt
    await this.db
      .update(entities)
      .set({
        mentionCount: sql`${entities.mentionCount} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entityId));
  }

  async getEntity(id: string): Promise<EntityWithRelations | null> {
    const [entity] = await this.db
      .select()
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (!entity) return null;

    // Get linked memories
    const linkedMemories = await this.db
      .select({
        id: memories.id,
        content: memories.content,
        type: memories.type,
        importance: memories.importance,
        createdAt: memories.createdAt,
        role: entityMemories.role,
      })
      .from(entityMemories)
      .innerJoin(memories, eq(entityMemories.memoryId, memories.id))
      .where(eq(entityMemories.entityId, id))
      .orderBy(desc(memories.createdAt))
      .limit(50);

    // Get co-occurring entities (share memories with this entity)
    const coOccurring = await this.db.execute(sql`
      SELECT e.*, COUNT(DISTINCT em2.memory_id) as shared_memory_count
      FROM entities e
      JOIN entity_memories em2 ON em2.entity_id = e.id
      WHERE em2.memory_id IN (
        SELECT memory_id FROM entity_memories WHERE entity_id = ${id}
      )
      AND e.id != ${id}
      GROUP BY e.id
      ORDER BY shared_memory_count DESC
      LIMIT 20
    `);

    return {
      ...this.toEntity(entity),
      memories: linkedMemories.map((m) => ({
        id: m.id,
        content: m.content,
        type: m.type,
        importance: m.importance,
        createdAt: m.createdAt,
        role: m.role,
      })),
      relatedEntities: (coOccurring as any[]).map((r: any) => ({
        ...this.toEntity(r),
        sharedMemoryCount: Number(r.shared_memory_count),
      })),
    };
  }

  async list(
    opts: {
      type?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ entities: Entity[]; total: number }> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    const conditions = [];
    if (opts.type) {
      conditions.push(eq(entities.type, opts.type));
    }
    if (opts.search) {
      conditions.push(sql`(
        name ILIKE ${"%" + opts.search + "%"} OR
        description ILIKE ${"%" + opts.search + "%"}
      )`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select()
      .from(entities)
      .where(where)
      .orderBy(desc(entities.mentionCount))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entities)
      .where(where);

    return {
      entities: results.map((r) => this.toEntity(r)),
      total: Number(count),
    };
  }

  async getGraph(): Promise<EntityGraphData> {
    // Get all entities with mentionCount > 0
    const allEntities = await this.db
      .select()
      .from(entities)
      .where(sql`mention_count > 0`)
      .orderBy(desc(entities.mentionCount))
      .limit(200);

    // Get co-occurrence edges (entities sharing memories)
    const edges = await this.db.execute(sql`
      SELECT
        em1.entity_id as source_id,
        em2.entity_id as target_id,
        COUNT(DISTINCT em1.memory_id) as shared_memory_count
      FROM entity_memories em1
      JOIN entity_memories em2
        ON em1.memory_id = em2.memory_id
        AND em1.entity_id < em2.entity_id
      GROUP BY em1.entity_id, em2.entity_id
      HAVING COUNT(DISTINCT em1.memory_id) >= 1
      ORDER BY shared_memory_count DESC
      LIMIT 500
    `);

    return {
      nodes: allEntities.map((r) => this.toEntity(r)),
      edges: (edges as any[]).map((r: any) => ({
        sourceId: r.source_id,
        targetId: r.target_id,
        sharedMemoryCount: Number(r.shared_memory_count),
      })),
    };
  }

  async getEntityMemories(
    entityId: string,
    limit = 20
  ): Promise<Array<{
    id: string;
    content: string;
    type: string;
    importance: number;
    createdAt: Date;
    role: string | null;
  }>> {
    return this.db
      .select({
        id: memories.id,
        content: memories.content,
        type: memories.type,
        importance: memories.importance,
        createdAt: memories.createdAt,
        role: entityMemories.role,
      })
      .from(entityMemories)
      .innerJoin(memories, eq(entityMemories.memoryId, memories.id))
      .where(eq(entityMemories.entityId, entityId))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
  }

  async merge(keepId: string, mergeId: string): Promise<void> {
    // Transfer all memory links from mergeId to keepId
    const mergeLinks = await this.db
      .select()
      .from(entityMemories)
      .where(eq(entityMemories.entityId, mergeId));

    for (const link of mergeLinks) {
      await this.db
        .insert(entityMemories)
        .values({ entityId: keepId, memoryId: link.memoryId, role: link.role })
        .onConflictDoNothing();
    }

    // Merge aliases
    const [keep] = await this.db.select().from(entities).where(eq(entities.id, keepId));
    const [merged] = await this.db.select().from(entities).where(eq(entities.id, mergeId));
    if (keep && merged) {
      const keepAliases = (keep.aliases as string[]) || [];
      const mergeAliases = (merged.aliases as string[]) || [];
      const allAliases = [...new Set([...keepAliases, ...mergeAliases, merged.name])];
      await this.db
        .update(entities)
        .set({
          aliases: allAliases,
          mentionCount: keep.mentionCount + merged.mentionCount,
          updatedAt: new Date(),
        })
        .where(eq(entities.id, keepId));
    }

    // Delete merged entity (cascade deletes its entity_memories)
    await this.db.delete(entities).where(eq(entities.id, mergeId));
  }

  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    recentlyActive: Entity[];
  }> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entities);

    const typeCounts = await this.db
      .select({
        type: entities.type,
        count: sql<number>`count(*)`,
      })
      .from(entities)
      .groupBy(entities.type);

    const recent = await this.db
      .select()
      .from(entities)
      .orderBy(desc(entities.lastSeenAt))
      .limit(10);

    const byType: Record<string, number> = {};
    for (const tc of typeCounts) {
      byType[tc.type] = Number(tc.count);
    }

    return {
      total: Number(count),
      byType,
      recentlyActive: recent.map((r) => this.toEntity(r)),
    };
  }

  async getRecentlyActive(days = 7, limit = 10): Promise<Entity[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const results = await this.db
      .select()
      .from(entities)
      .where(sql`last_seen_at >= ${since.toISOString()}`)
      .orderBy(desc(entities.mentionCount))
      .limit(limit);

    return results.map((r) => this.toEntity(r));
  }

  async update(
    id: string,
    data: { name?: string; description?: string; aliases?: string[]; type?: EntityType }
  ): Promise<Entity | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.aliases !== undefined) updates.aliases = data.aliases;
    if (data.type !== undefined) updates.type = data.type;

    const [result] = await this.db
      .update(entities)
      .set(updates)
      .where(eq(entities.id, id))
      .returning();

    return result ? this.toEntity(result) : null;
  }

  async remove(id: string): Promise<boolean> {
    await this.db.delete(entities).where(eq(entities.id, id));
    return true;
  }

  private toEntity(row: any): Entity {
    return {
      id: row.id,
      name: row.name,
      type: row.type as EntityType,
      aliases: row.aliases as string[] | null,
      description: row.description,
      importance: row.importance,
      mentionCount: row.mention_count ?? row.mentionCount ?? 0,
      firstSeenAt: new Date(row.first_seen_at ?? row.firstSeenAt),
      lastSeenAt: new Date(row.last_seen_at ?? row.lastSeenAt),
      createdAt: new Date(row.created_at ?? row.createdAt),
    };
  }
}
