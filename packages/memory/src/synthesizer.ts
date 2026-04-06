// ============================================================
// BODHI — Memory Synthesizer
// Self-improvement loop: dedup, connect, decay, promote
// Runs daily via Scheduler cron job
// ============================================================

import type { AIBackend } from "@seneca/core";
import type { Database } from "@seneca/db";
import { sql } from "drizzle-orm";
import type { MemoryService, MemoryResult } from "./service.js";

export interface SynthesisReport {
  deduped: number;
  connected: number;
  decayed: number;
  promoted: number;
  autoConfirmed: number;
  feedbackApplied: number;
  durationMs: number;
}

export class MemorySynthesizer {
  private memoryService: MemoryService;
  private backend: AIBackend;
  private db?: Database;

  constructor(memoryService: MemoryService, backend: AIBackend, db?: Database) {
    this.memoryService = memoryService;
    this.backend = backend;
    this.db = db;
  }

  /**
   * Run the full synthesis cycle. Called by Scheduler daily at 03:00.
   */
  async run(): Promise<SynthesisReport> {
    const startTime = Date.now();
    console.log("[synthesizer] Starting daily synthesis cycle...");

    const [deduped, decayed, promoted, autoConfirmed, feedbackApplied] = await Promise.all([
      this.dedup(),
      this.decay(),
      this.promote(),
      this.autoConfirmPending(),
      this.applyFeedbackSignals(),
    ]);

    // Connect runs after dedup to avoid processing duplicates
    const connected = await this.connect();

    const report: SynthesisReport = {
      deduped,
      connected,
      decayed,
      promoted,
      autoConfirmed,
      feedbackApplied,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `[synthesizer] Done: ${deduped} deduped, ${connected} connected, ${decayed} decayed, ${promoted} promoted, ${autoConfirmed} auto-confirmed, ${feedbackApplied} feedback-applied (${(report.durationMs / 1000).toFixed(1)}s)`
    );

    return report;
  }

  /**
   * Find near-duplicate memories (>0.92 similarity) and soft-delete the weaker one.
   */
  private async dedup(): Promise<number> {
    let deduped = 0;
    const seen = new Set<string>();

    // Get recent memories to check for duplicates
    const recent = await this.memoryService.list(50);

    for (const memory of recent) {
      if (seen.has(memory.id)) continue;

      const similar = await this.memoryService.findSimilarToMemory(
        memory.id,
        0.92,
        5
      );

      for (const dup of similar) {
        if (seen.has(dup.id)) continue;
        seen.add(dup.id);

        // Keep the one with more content (richer description)
        // Soft-delete the other by setting confidence to 0
        const keepId = memory.content.length >= dup.content.length ? memory.id : dup.id;
        const removeId = keepId === memory.id ? dup.id : memory.id;

        await this.memoryService.adjustConfidence([removeId], -10); // Force to 0
        deduped++;

        console.log(
          `[synthesizer] Deduped: "${truncate(dup.content, 50)}" (sim=${dup.similarity.toFixed(2)})`
        );
      }

      seen.add(memory.id);
    }

    return deduped;
  }

  /**
   * Find clusters of related memories and generate synthesis patterns.
   * Uses Bridge → Claude to write the synthesis.
   */
  private async connect(): Promise<number> {
    let connected = 0;
    const processed = new Set<string>();

    // Sample memories from different time periods
    const memories = await this.memoryService.list(30);

    for (const memory of memories) {
      if (processed.has(memory.id)) continue;
      if (memory.type === "pattern" && memory.tags?.includes("auto-synthesis")) continue;

      const similar = await this.memoryService.findSimilarToMemory(
        memory.id,
        0.80,
        8
      );

      // Need 3+ related memories spanning 2+ different days to form a cluster
      const cluster = [memory, ...similar];
      const uniqueDays = new Set(
        cluster.map((m) => m.createdAt.toISOString().slice(0, 10))
      );

      if (cluster.length < 3 || uniqueDays.size < 2) continue;

      // Mark all as processed to avoid re-clustering
      for (const m of cluster) processed.add(m.id);

      // Generate synthesis via Bridge
      const clusterText = cluster
        .slice(0, 6) // Cap at 6 to keep prompt short
        .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
        .join("\n");

      try {
        const prompt = `<system>
You are a memory synthesis system. Given a cluster of related memories, write ONE concise synthesis statement that captures the overarching pattern or theme.

Rules:
- One sentence, max 50 words
- Focus on the pattern, not individual facts
- Start with what the user is doing or building
- Be specific, not generic
- Respond with ONLY the synthesis text, nothing else
- Do NOT use any tools
</system>

Related memories (${cluster.length} items spanning ${uniqueDays.size} days):
${clusterText}

Write the synthesis:`;

        const task = await this.backend.execute(prompt, {
          model: "sonnet",
          tools: "",
          noSessionPersistence: true,
        });

        const synthesis = (task.result || "").trim();
        if (synthesis && synthesis.length > 10 && synthesis.length < 300) {
          await this.memoryService.store({
            content: synthesis,
            type: "pattern",
            source: "synthesis",
            importance: 0.7,
            tags: ["auto-synthesis"],
          });
          connected++;
          console.log(`[synthesizer] Connected: "${truncate(synthesis, 60)}"`);
        }
      } catch (err) {
        console.error(
          "[synthesizer] Connect failed:",
          err instanceof Error ? err.message : err
        );
      }
    }

    return connected;
  }

  /**
   * Decay stale, low-importance memories by reducing confidence.
   */
  private async decay(): Promise<number> {
    const stale = await this.memoryService.getStaleMemories(30, 0.5);
    if (stale.length === 0) return 0;

    const ids = stale.map((m) => m.id);
    await this.memoryService.adjustConfidence(ids, -0.1);

    console.log(`[synthesizer] Decayed ${ids.length} stale memories (confidence -0.1)`);
    return ids.length;
  }

  /**
   * Apply user feedback signals to memory confidence/importance.
   * Unhelpful responses → reduce confidence of associated memories.
   * Helpful responses → boost importance of associated memories.
   */
  private async applyFeedbackSignals(): Promise<number> {
    if (!this.db) return 0;

    try {
      // Find turns with feedback from the past 24 hours
      const turns = await this.db.execute(sql`
        SELECT id, feedback, context_snapshot
        FROM conversation_turns
        WHERE feedback IS NOT NULL
          AND created_at > now() - interval '24 hours'
          AND role = 'assistant'
      `) as any[];

      if (turns.length === 0) return 0;

      let applied = 0;

      for (const turn of turns) {
        const feedback = turn.feedback as { rating: string } | null;
        const snapshot = turn.context_snapshot as { memories?: string[] } | null;
        if (!feedback) continue;

        // Try to find memory IDs from the context snapshot
        // The snapshot structure varies — look for any memory references
        const memoryIds: string[] = [];
        if (snapshot && typeof snapshot === "object") {
          // Check if snapshot contains memory IDs directly
          if (Array.isArray(snapshot.memories)) {
            memoryIds.push(...snapshot.memories);
          }
        }

        // If we found memory IDs, adjust them based on feedback
        if (memoryIds.length > 0) {
          if (feedback.rating === "unhelpful") {
            await this.memoryService.adjustConfidence(memoryIds, -0.05);
            applied += memoryIds.length;
          } else if (feedback.rating === "helpful") {
            await this.memoryService.adjustImportance(memoryIds, 0.05, 1.0);
            applied += memoryIds.length;
          }
        }
      }

      if (applied > 0) {
        console.log(`[synthesizer] Applied feedback signals to ${applied} memories`);
      }
      return applied;
    } catch (err) {
      console.error("[synthesizer] Feedback signals failed:", err instanceof Error ? err.message : err);
      return 0;
    }
  }

  /**
   * Auto-confirm pending memories older than 7 days.
   * Prevents the pending queue from becoming a chore.
   */
  private async autoConfirmPending(): Promise<number> {
    const confirmed = await this.memoryService.autoConfirmOldPending(7);
    if (confirmed > 0) {
      console.log(`[synthesizer] Auto-confirmed ${confirmed} pending memories (>7 days old)`);
    }
    return confirmed;
  }

  /**
   * Promote frequently-accessed memories by boosting importance.
   */
  private async promote(): Promise<number> {
    const frequent = await this.memoryService.getFrequentlyAccessed(5, 20);
    if (frequent.length === 0) return 0;

    const ids = frequent.map((m) => m.id);
    await this.memoryService.adjustImportance(ids, 0.1, 1.0);

    console.log(`[synthesizer] Promoted ${ids.length} frequently-accessed memories (importance +0.1)`);
    return ids.length;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
