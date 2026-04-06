// ============================================================
// BODHI — Conversation Service
// CRUD for conversation threads + turns using Drizzle ORM
// ============================================================

import { eq, desc, sql, and, isNull, or } from "drizzle-orm";
import type { Database } from "@seneca/db";
import { conversationThreads, conversationTurns } from "@seneca/db";

type ExtractionStatus = "pending" | "success" | "failed" | "abandoned";

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
      contextSnapshot?: Record<string, unknown>;
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
        contextSnapshot: turn.contextSnapshot,
      });
  }

  async getTurns(threadId: string, limit?: number) {
    let query = this.db
      .select({
        id: conversationTurns.id,
        role: conversationTurns.role,
        content: conversationTurns.content,
        feedback: conversationTurns.feedback,
        selfAssessment: conversationTurns.selfAssessment,
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

  // ============================================================
  // Feedback + Self-Assessment
  // ============================================================

  async setFeedback(
    turnId: string,
    feedback: { rating: "helpful" | "unhelpful"; text?: string }
  ): Promise<boolean> {
    const result = await this.db
      .update(conversationTurns)
      .set({
        feedback: {
          rating: feedback.rating,
          text: feedback.text,
          at: new Date().toISOString(),
        },
      })
      .where(
        and(
          eq(conversationTurns.id, turnId),
          eq(conversationTurns.role, "assistant")
        )
      );
    return (result as any).rowCount > 0;
  }

  async setSelfAssessment(
    turnId: string,
    assessment: { score: number; reasoning?: string }
  ): Promise<void> {
    await this.db
      .update(conversationTurns)
      .set({
        selfAssessment: {
          score: assessment.score,
          reasoning: assessment.reasoning,
          at: new Date().toISOString(),
        },
      })
      .where(eq(conversationTurns.id, turnId));
  }

  /**
   * Return the ID of the last assistant turn in a thread.
   * Used to attach feedback or self-assessment after streaming completes.
   */
  async getLastAssistantTurnId(threadId: string): Promise<string | null> {
    const [turn] = await this.db
      .select({ id: conversationTurns.id })
      .from(conversationTurns)
      .where(
        and(
          eq(conversationTurns.threadId, threadId),
          eq(conversationTurns.role, "assistant")
        )
      )
      .orderBy(desc(conversationTurns.createdAt))
      .limit(1);
    return turn?.id ?? null;
  }

  // ============================================================
  // Extraction tracking
  // ============================================================

  /**
   * Find threads that need extraction: no extraction_status set, or failed
   * (with fewer than 3 attempts). Ordered by most recent first.
   */
  async getStaleThreads(limit = 10) {
    const results = await this.db
      .select({
        id: conversationThreads.id,
        channel: conversationThreads.channel,
        title: conversationThreads.title,
        extractionStatus: conversationThreads.extractionStatus,
        extractionAttempts: conversationThreads.extractionAttempts,
        lastActiveAt: conversationThreads.lastActiveAt,
      })
      .from(conversationThreads)
      .where(
        and(
          or(
            isNull(conversationThreads.extractionStatus),
            eq(conversationThreads.extractionStatus, "failed")
          ),
          sql`${conversationThreads.extractionAttempts} < 3`
        )
      )
      .orderBy(desc(conversationThreads.lastActiveAt))
      .limit(limit);

    return results;
  }

  /**
   * Mark a thread's extraction status. Used for dedup and retry tracking.
   */
  async markExtracted(
    threadId: string,
    status: ExtractionStatus
  ): Promise<void> {
    const update: Record<string, any> = {
      extractionStatus: status,
    };

    if (status === "pending") {
      // Mark as pending before starting — prevents duplicate extraction
    } else if (status === "success" || status === "failed" || status === "abandoned") {
      update.extractedAt = new Date();
    }

    if (status === "failed") {
      // Increment attempt counter on failure
      await this.db.execute(sql`
        UPDATE conversation_threads
        SET extraction_status = 'failed',
            extracted_at = now(),
            extraction_attempts = extraction_attempts + 1
        WHERE id = ${threadId}
      `);
      return;
    }

    await this.db
      .update(conversationThreads)
      .set(update)
      .where(eq(conversationThreads.id, threadId));
  }

  /**
   * Get threads with failed extractions (for monitoring/dashboard).
   */
  async getFailedExtractions(limit = 20) {
    return this.db
      .select({
        id: conversationThreads.id,
        channel: conversationThreads.channel,
        title: conversationThreads.title,
        extractionAttempts: conversationThreads.extractionAttempts,
        extractedAt: conversationThreads.extractedAt,
        lastActiveAt: conversationThreads.lastActiveAt,
      })
      .from(conversationThreads)
      .where(eq(conversationThreads.extractionStatus, "failed"))
      .orderBy(desc(conversationThreads.lastActiveAt))
      .limit(limit);
  }

  /**
   * Get the extraction status for a specific thread.
   */
  async getExtractionStatus(threadId: string) {
    const [result] = await this.db
      .select({
        extractionStatus: conversationThreads.extractionStatus,
        extractionAttempts: conversationThreads.extractionAttempts,
      })
      .from(conversationThreads)
      .where(eq(conversationThreads.id, threadId));
    return result ?? null;
  }
}
