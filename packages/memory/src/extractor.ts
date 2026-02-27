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

      // Store each extracted memory
      for (const memory of extracted) {
        await this.memoryService.store({
          content: memory.content,
          type: memory.type,
          source: "extraction",
          sourceThreadId: threadId,
          importance: memory.importance,
        });
      }

      console.log(
        `[memory] Extracted ${extracted.length} memories from conversation`
      );
    } catch (error) {
      // Non-fatal — don't break the conversation flow
      console.error(
        "[memory] Extraction failed:",
        error instanceof Error ? error.message : error
      );
    }
  }
}
