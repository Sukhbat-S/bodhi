// ============================================================
// BODHI — Memory Extractor
// Extracts memorable facts from conversations via Claude Code CLI
// Routes through Bridge (Max subscription) — $0 cost
// ============================================================

import type { AIBackend } from "@seneca/core";
import type { MemoryInput } from "./service.js";
import { MemoryService } from "./service.js";

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this conversation exchange and extract key facts, decisions, preferences, patterns, or events worth remembering about the user.

Rules:
- Only extract genuinely memorable information (not small talk or filler)
- Each memory should be a single, clear statement
- Include the user's name if mentioned
- Capture decisions and their reasoning
- Capture preferences, habits, and patterns
- Capture important dates, deadlines, and events
- Capture emotional states or concerns only if significant
- If nothing is worth remembering, return an empty array

Return a JSON array of objects with these fields:
- content: string (the memory, written as a factual statement)
- type: "fact" | "decision" | "pattern" | "preference" | "event"
- importance: number (0.1 to 1.0 — how important is this to remember?)

Example output:
[
  {"content": "Sukhbat decided to use Voyage AI for embeddings instead of OpenAI", "type": "decision", "importance": 0.7},
  {"content": "The jewelry platform launch is targeted for March 24, 2026", "type": "event", "importance": 0.9}
]

If nothing worth remembering: []`;

export class MemoryExtractor {
  private backend: AIBackend;
  private memoryService: MemoryService;

  constructor(memoryService: MemoryService, backend: AIBackend) {
    this.backend = backend;
    this.memoryService = memoryService;
  }

  async extract(
    userMessage: string,
    assistantResponse: string,
    threadId?: string
  ): Promise<void> {
    try {
      // Embed extraction instructions directly in the -p prompt
      // (most robust — avoids --system-prompt flag issues with spawn)
      const fullPrompt = `<system>
${EXTRACTION_PROMPT}

IMPORTANT: Respond ONLY with the JSON array. Do NOT use any tools. Do NOT try to read, write, or edit any files. Just output the JSON array.
</system>

User message: ${userMessage}

Assistant response: ${assistantResponse}`;

      console.log("[memory] Sending extraction to Bridge...");

      const task = await this.backend.execute(fullPrompt, {
        model: "sonnet",
        tools: "",  // Disable all tools — pure extraction
        noSessionPersistence: true,
      });

      console.log(`[memory] Bridge returned: status=${task.status}, result length=${task.result?.length || 0}, error=${task.error || "none"}`);

      const text = task.result || task.error || "";

      // Parse the JSON array from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      const extracted: Array<{
        content: string;
        type: MemoryInput["type"];
        importance: number;
      }> = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(extracted) || extracted.length === 0) return;

      // Store each extracted memory and collect IDs for cross-referencing
      const storedIds: string[] = [];
      for (const memory of extracted) {
        const id = await this.memoryService.store({
          content: memory.content,
          type: memory.type,
          source: "extraction",
          sourceThreadId: threadId,
          importance: memory.importance,
        });
        storedIds.push(id);
      }

      console.log(
        `[memory] Extracted ${extracted.length} memories from conversation`
      );

      // Cross-session reasoning: check if new memories connect to existing ones
      this.crossReference(extracted).catch((err) => {
        console.error("[memory] Cross-reference failed:", err instanceof Error ? err.message : err);
      });
    } catch (error) {
      // Non-fatal — don't break the conversation flow
      console.error(
        "[memory] Extraction failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Cross-session reasoning: for each new memory, check if similar memories
   * exist from different sessions/days. If a theme appears 3+ times across
   * 2+ different days, generate a pattern memory.
   */
  private async crossReference(
    newMemories: Array<{ content: string; type: MemoryInput["type"]; importance: number }>
  ): Promise<void> {
    for (const memory of newMemories) {
      const similar = await this.memoryService.retrieve(memory.content, 6);

      // Filter to memories from different days than today
      const today = new Date().toISOString().slice(0, 10);
      const fromOtherDays = similar.filter(
        (m) => m.createdAt.toISOString().slice(0, 10) !== today
      );

      // Need 2+ similar memories from other days (+ this new one = 3+ total)
      if (fromOtherDays.length < 2) continue;

      const uniqueDays = new Set(
        fromOtherDays.map((m) => m.createdAt.toISOString().slice(0, 10))
      );
      if (uniqueDays.size < 2) continue;

      // Check we haven't already generated a cross-session pattern for this theme
      const existingPatterns = await this.memoryService.retrieve(
        `recurring theme: ${memory.content}`,
        3
      );
      const alreadySynthesized = existingPatterns.some(
        (p) => p.tags?.includes("cross-session") && p.similarity > 0.85
      );
      if (alreadySynthesized) continue;

      // Generate cross-session pattern via Bridge
      const clusterText = [memory, ...fromOtherDays.slice(0, 4)]
        .map((m, i) => `${i + 1}. ${m.content}`)
        .join("\n");

      try {
        const prompt = `<system>
You detect recurring themes across multiple conversations/sessions.
Given these related memories from different days, write ONE concise observation about the recurring pattern.

Rules:
- One sentence, max 40 words
- Start with "Recurring theme:"
- Be specific about what keeps coming up
- Do NOT use any tools
- Respond with ONLY the observation text
</system>

Memories spanning ${uniqueDays.size + 1} days:
${clusterText}`;

        const task = await this.backend.execute(prompt, {
          model: "sonnet",
          tools: "",
          noSessionPersistence: true,
        });

        const pattern = (task.result || "").trim();
        if (pattern && pattern.length > 10 && pattern.length < 200) {
          await this.memoryService.store({
            content: pattern,
            type: "pattern",
            source: "synthesis",
            importance: 0.7,
            tags: ["auto-synthesis", "cross-session"],
          });
          console.log(`[memory] Cross-session pattern: "${pattern}"`);
        }
      } catch {
        // Non-fatal
      }
    }
  }
}
