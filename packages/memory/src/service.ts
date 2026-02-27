// ============================================================
// BODHI — Memory Service
// Store, retrieve, and manage memories with vector search
// ============================================================

import { eq, desc, sql, and } from "drizzle-orm";
import { memories } from "@seneca/db";
import type { Database } from "@seneca/db";
import { embedSingle, DIMENSIONS } from "./embedding.js";

export interface MemoryInput {
  content: string;
  type?: "fact" | "decision" | "pattern" | "preference" | "event";
  source?: "conversation" | "manual" | "extraction";
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
      await this.db.execute(sql`
        UPDATE memories
        SET access_count = access_count + 1,
            last_accessed_at = now()
        WHERE id = ANY(${ids}::uuid[])
      `);
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
