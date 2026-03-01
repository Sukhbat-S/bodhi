// ============================================================
// BODHI — Memory Service
// Store, retrieve, and manage memories with vector search
// ============================================================

import { eq, desc, sql, and } from "drizzle-orm";
import { memories } from "@seneca/db";
import type { Database } from "@seneca/db";
import { embed, embedSingle, DIMENSIONS } from "./embedding.js";

export interface MemoryInput {
  content: string;
  type?: "fact" | "decision" | "pattern" | "preference" | "event";
  source?: "conversation" | "manual" | "extraction" | "synthesis";
  sourceThreadId?: string;
  importance?: number;
  tags?: string[];
}

export interface MemoryResult {
  id: string;
  content: string;
  type: string;
  importance: number;
  confidence: number;
  similarity: number;
  createdAt: Date;
  tags: string[] | null;
}

export class MemoryService {
  private db: Database;
  private voyageApiKey: string;

  constructor(db: Database, voyageApiKey: string) {
    this.db = db;
    this.voyageApiKey = voyageApiKey;
  }

  async store(input: MemoryInput): Promise<string> {
    const embedding = await embedSingle(input.content, this.voyageApiKey);

    const [result] = await this.db
      .insert(memories)
      .values({
        content: input.content,
        type: input.type || "fact",
        source: input.source || "extraction",
        sourceThreadId: input.sourceThreadId,
        importance: input.importance ?? 0.5,
        embedding,
        tags: input.tags,
      })
      .returning({ id: memories.id });

    return result.id;
  }

  async storeBatch(
    inputs: MemoryInput[]
  ): Promise<{ stored: number; ids: string[] }> {
    if (inputs.length === 0) return { stored: 0, ids: [] };

    // Batch-embed all texts in a single Voyage AI API call
    const texts = inputs.map((i) => i.content);
    const embeddings = await embed(texts, this.voyageApiKey);

    // Insert all memories in one transaction
    const values = inputs.map((input, idx) => ({
      content: input.content,
      type: input.type || ("fact" as const),
      source: input.source || ("manual" as const),
      sourceThreadId: input.sourceThreadId,
      importance: input.importance ?? 0.5,
      embedding: embeddings[idx],
      tags: input.tags,
    }));

    const results = await this.db
      .insert(memories)
      .values(values)
      .returning({ id: memories.id });

    return { stored: results.length, ids: results.map((r) => r.id) };
  }

  async retrieve(query: string, limit = 5): Promise<MemoryResult[]> {
    const queryEmbedding = await embedSingle(query, this.voyageApiKey);

    // Cosine similarity search via pgvector
    const results = await this.db.execute(sql`
      SELECT
        id,
        content,
        type,
        importance,
        confidence,
        tags,
        created_at,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM memories
      WHERE confidence > 0.1
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);

    // Update access stats for retrieved memories
    const ids = (results as any[]).map((r: any) => r.id);
    if (ids.length > 0) {
      // Build a SQL-safe array literal for uuid casting
      const idList = ids.map((id: string) => `'${id}'`).join(",");
      await this.db.execute(sql.raw(`
        UPDATE memories
        SET access_count = access_count + 1,
            last_accessed_at = now()
        WHERE id IN (${idList})
      `));
    }

    return (results as any[]).map((r: any) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      importance: r.importance,
      confidence: r.confidence,
      similarity: r.similarity,
      createdAt: r.created_at,
      tags: r.tags,
    }));
  }

  async forget(memoryId: string): Promise<boolean> {
    const result = await this.db
      .delete(memories)
      .where(eq(memories.id, memoryId));
    return true;
  }

  async list(limit = 20): Promise<MemoryResult[]> {
    const results = await this.db
      .select({
        id: memories.id,
        content: memories.content,
        type: memories.type,
        importance: memories.importance,
        confidence: memories.confidence,
        createdAt: memories.createdAt,
        tags: memories.tags,
      })
      .from(memories)
      .orderBy(desc(memories.createdAt))
      .limit(limit);

    return results.map((r) => ({
      ...r,
      similarity: 1,
    }));
  }

  async listFiltered(opts: {
    limit?: number;
    offset?: number;
    tag?: string;
    search?: string;
  } = {}): Promise<{ memories: MemoryResult[]; total: number }> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    const conditions = [];

    if (opts.tag) {
      conditions.push(sql`tags ? ${opts.tag}`);
    }
    if (opts.search) {
      conditions.push(sql`content ILIKE ${"%" + opts.search + "%"}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // Get total count
    const countResult = await this.db.execute(
      sql`SELECT count(*)::int as total FROM memories ${whereClause}`
    );
    const total = (countResult as any[])[0]?.total ?? 0;

    // Get paginated results
    const results = await this.db.execute(sql`
      SELECT
        id, content, type, importance, confidence, tags,
        created_at, access_count, last_accessed_at
      FROM memories
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return {
      total,
      memories: (results as any[]).map((r: any) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        importance: r.importance,
        confidence: r.confidence,
        similarity: 1,
        createdAt: r.created_at,
        tags: r.tags,
        accessCount: r.access_count,
        lastAccessedAt: r.last_accessed_at,
      })),
    };
  }

  // ============================================================
  // Intelligence methods (for Synthesizer + InsightGenerator)
  // ============================================================

  /**
   * Find memories similar to a given memory by its embedding.
   * Used by Synthesizer for dedup and clustering.
   */
  async findSimilarToMemory(
    memoryId: string,
    threshold = 0.80,
    limit = 10
  ): Promise<(MemoryResult & { targetId: string })[]> {
    const results = await this.db.execute(sql`
      WITH target AS (
        SELECT embedding FROM memories WHERE id = ${memoryId}
      )
      SELECT
        m.id, m.content, m.type, m.importance, m.confidence,
        m.tags, m.created_at,
        1 - (m.embedding <=> t.embedding) as similarity
      FROM memories m, target t
      WHERE m.id != ${memoryId}
        AND m.confidence > 0.1
        AND 1 - (m.embedding <=> t.embedding) > ${threshold}
      ORDER BY m.embedding <=> t.embedding
      LIMIT ${limit}
    `);

    return (results as any[]).map((r: any) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      importance: r.importance,
      confidence: r.confidence,
      similarity: r.similarity,
      createdAt: r.created_at,
      tags: r.tags,
      targetId: memoryId,
    }));
  }

  /**
   * Batch adjust confidence for a set of memories.
   * delta can be negative (decay) or positive (restore).
   */
  async adjustConfidence(ids: string[], delta: number): Promise<void> {
    if (ids.length === 0) return;
    const idList = ids.map((id) => `'${id}'`).join(",");
    await this.db.execute(sql.raw(`
      UPDATE memories
      SET confidence = GREATEST(0, LEAST(1, confidence + ${delta})),
          updated_at = now()
      WHERE id IN (${idList})
    `));
  }

  /**
   * Batch adjust importance for a set of memories with a cap.
   */
  async adjustImportance(ids: string[], delta: number, cap = 1.0): Promise<void> {
    if (ids.length === 0) return;
    const idList = ids.map((id) => `'${id}'`).join(",");
    await this.db.execute(sql.raw(`
      UPDATE memories
      SET importance = GREATEST(0, LEAST(${cap}, importance + ${delta})),
          updated_at = now()
      WHERE id IN (${idList})
    `));
  }

  /**
   * Get stale memories: not accessed recently, low importance.
   * Candidates for confidence decay.
   */
  async getStaleMemories(daysUnaccessed = 30, maxImportance = 0.5): Promise<MemoryResult[]> {
    const results = await this.db.execute(sql`
      SELECT id, content, type, importance, confidence, tags, created_at
      FROM memories
      WHERE confidence > 0.1
        AND importance < ${maxImportance}
        AND (last_accessed_at IS NULL OR last_accessed_at < now() - ${daysUnaccessed + ' days'}::interval)
        AND created_at < now() - ${daysUnaccessed + ' days'}::interval
      ORDER BY importance ASC
      LIMIT 50
    `);

    return (results as any[]).map((r: any) => ({
      id: r.id, content: r.content, type: r.type,
      importance: r.importance, confidence: r.confidence,
      similarity: 1, createdAt: r.created_at, tags: r.tags,
    }));
  }

  /**
   * Get frequently accessed memories. Candidates for importance promotion.
   */
  async getFrequentlyAccessed(minAccessCount = 5, limit = 20): Promise<MemoryResult[]> {
    const results = await this.db.execute(sql`
      SELECT id, content, type, importance, confidence, tags, created_at, access_count
      FROM memories
      WHERE access_count >= ${minAccessCount}
        AND confidence > 0.1
        AND importance < 1.0
      ORDER BY access_count DESC
      LIMIT ${limit}
    `);

    return (results as any[]).map((r: any) => ({
      id: r.id, content: r.content, type: r.type,
      importance: r.importance, confidence: r.confidence,
      similarity: 1, createdAt: r.created_at, tags: r.tags,
    }));
  }

  /**
   * Get memory creation count over a period.
   */
  async getCreationRate(days = 7): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT count(*)::int as count
      FROM memories
      WHERE created_at > now() - ${days + ' days'}::interval
    `);
    return (result as any[])[0]?.count ?? 0;
  }

  /**
   * Compare tag frequency between two time periods.
   */
  async getTagTrends(
    recentDays = 7,
    previousDays = 7
  ): Promise<{ tag: string; recent: number; previous: number }[]> {
    const results = await this.db.execute(sql`
      WITH recent_tags AS (
        SELECT tag, count(*)::int as cnt
        FROM memories, jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) as tag
        WHERE created_at > now() - ${recentDays + ' days'}::interval
        GROUP BY tag
      ),
      previous_tags AS (
        SELECT tag, count(*)::int as cnt
        FROM memories, jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) as tag
        WHERE created_at BETWEEN now() - ${(recentDays + previousDays) + ' days'}::interval
                              AND now() - ${recentDays + ' days'}::interval
        GROUP BY tag
      )
      SELECT
        COALESCE(r.tag, p.tag) as tag,
        COALESCE(r.cnt, 0) as recent,
        COALESCE(p.cnt, 0) as previous
      FROM recent_tags r
      FULL OUTER JOIN previous_tags p ON r.tag = p.tag
      ORDER BY COALESCE(r.cnt, 0) DESC
      LIMIT 15
    `);

    return (results as any[]).map((r: any) => ({
      tag: r.tag,
      recent: r.recent,
      previous: r.previous,
    }));
  }

  /**
   * Find decisions that were made but never revisited.
   */
  async getStalledDecisions(minAgeDays = 7, maxAccess = 2): Promise<MemoryResult[]> {
    const results = await this.db.execute(sql`
      SELECT id, content, type, importance, confidence, tags, created_at
      FROM memories
      WHERE type = 'decision'
        AND confidence > 0.1
        AND access_count < ${maxAccess}
        AND created_at < now() - ${minAgeDays + ' days'}::interval
      ORDER BY importance DESC
      LIMIT 10
    `);

    return (results as any[]).map((r: any) => ({
      id: r.id, content: r.content, type: r.type,
      importance: r.importance, confidence: r.confidence,
      similarity: 1, createdAt: r.created_at, tags: r.tags,
    }));
  }

  /**
   * Find high-value memories that are never retrieved.
   */
  async getNeglectedHighValue(
    minImportance = 0.7,
    maxAccess = 0,
    minAgeDays = 14
  ): Promise<MemoryResult[]> {
    const results = await this.db.execute(sql`
      SELECT id, content, type, importance, confidence, tags, created_at
      FROM memories
      WHERE importance >= ${minImportance}
        AND confidence > 0.1
        AND access_count <= ${maxAccess}
        AND created_at < now() - ${minAgeDays + ' days'}::interval
      ORDER BY importance DESC
      LIMIT 10
    `);

    return (results as any[]).map((r: any) => ({
      id: r.id, content: r.content, type: r.type,
      importance: r.importance, confidence: r.confidence,
      similarity: 1, createdAt: r.created_at, tags: r.tags,
    }));
  }

  async getStats(): Promise<{
    totalMemories: number;
    topTags: { tag: string; count: number }[];
    recentCount: number;
  }> {
    // Total count
    const countResult = await this.db.execute(
      sql`SELECT count(*)::int as total FROM memories`
    );
    const totalMemories = (countResult as any[])[0]?.total ?? 0;

    // Recent count (last 24h)
    const recentResult = await this.db.execute(
      sql`SELECT count(*)::int as recent FROM memories WHERE created_at > now() - interval '24 hours'`
    );
    const recentCount = (recentResult as any[])[0]?.recent ?? 0;

    // Top tags (unnest JSONB array)
    const tagsResult = await this.db.execute(sql`
      SELECT tag, count(*)::int as count
      FROM memories, jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) as tag
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 10
    `);
    const topTags = (tagsResult as any[]).map((r: any) => ({
      tag: r.tag,
      count: r.count,
    }));

    return { totalMemories, topTags, recentCount };
  }
}
