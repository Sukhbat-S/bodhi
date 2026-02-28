// ============================================================
// BODHI — Conversation Service
// CRUD for conversation threads + turns using Drizzle ORM
// ============================================================

import { eq, desc, sql } from "drizzle-orm";
import type { Database } from "@seneca/db";
import { conversationThreads, conversationTurns } from "@seneca/db";

type Channel = "telegram" | "web" | "cli";

export class ConversationService {
  constructor(private db: Database) {}

  async createThread(channel: Channel) {
    const [thread] = await this.db
      .insert(conversationThreads)
      .values({ channel })
      .returning();
    return thread;
  }

  async listThreads(limit = 20, offset = 0) {
    const threads = await this.db
      .select({
        id: conversationThreads.id,
        channel: conversationThreads.channel,
        title: conversationThreads.title,
        createdAt: conversationThreads.createdAt,
        lastActiveAt: conversationThreads.lastActiveAt,
      })
      .from(conversationThreads)
      .orderBy(desc(conversationThreads.lastActiveAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationThreads);

    return { threads, total: count };
  }

  async getThread(id: string) {
    const [thread] = await this.db
      .select({
        id: conversationThreads.id,
        channel: conversationThreads.channel,
        title: conversationThreads.title,
        createdAt: conversationThreads.createdAt,
        lastActiveAt: conversationThreads.lastActiveAt,
      })
      .from(conversationThreads)
      .where(eq(conversationThreads.id, id));
    return thread ?? null;
  }

  async deleteThread(id: string) {
    await this.db
      .delete(conversationThreads)
      .where(eq(conversationThreads.id, id));
  }

  async addTurn(
    threadId: string,
    turn: {
      role: "user" | "assistant";
      content: string;
      channel: Channel;
      modelUsed?: string;
      durationMs?: number;
    }
  ): Promise<void> {
    await this.db
      .insert(conversationTurns)
      .values({
        threadId,
        role: turn.role,
        content: turn.content,
        channel: turn.channel,
        modelUsed: turn.modelUsed,
        durationMs: turn.durationMs,
      });
  }

  async getTurns(threadId: string, limit?: number) {
    let query = this.db
      .select({
        id: conversationTurns.id,
        role: conversationTurns.role,
        content: conversationTurns.content,
        createdAt: conversationTurns.createdAt,
      })
      .from(conversationTurns)
      .where(eq(conversationTurns.threadId, threadId))
      .orderBy(conversationTurns.createdAt);

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return query;
  }

  async updateTitle(threadId: string, title: string) {
    await this.db
      .update(conversationThreads)
      .set({ title })
      .where(eq(conversationThreads.id, threadId));
  }

  async touchThread(threadId: string) {
    await this.db
      .update(conversationThreads)
      .set({ lastActiveAt: new Date() })
      .where(eq(conversationThreads.id, threadId));
  }
}
