// ============================================================
// BODHI — Memory Extractor
// Extracts memorable facts from conversations via Claude Code CLI
// Routes through Bridge (Max subscription) — $0 cost
// ============================================================

import type { AIBackend } from "@seneca/core";
import type { MemoryInput } from "./service.js";
import { MemoryService } from "./service.js";
import type { EntityService, EntityType } from "./entity-service.js";

const SESSION_EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this Telegram conversation session and extract the most important facts, decisions, patterns, and events worth remembering long-term.

Rules:
- Focus on decisions made, directions chosen, insights realized, and patterns noticed
- Skip small talk, greetings, and routine status checks
- Each memory should be a single, clear, self-contained statement
- Prioritize: decisions (high importance), patterns (medium-high), facts (medium), events (medium)
- Aim for 3-8 high-quality memories from a full session — not every detail
- Also extract named entities: specific people, projects, organizations, topics, or places mentioned
- Do NOT extract generic concepts ("AI", "code", "database") as entities — only specific named things

Return a JSON object with:
- memories: array of {content: string, type: "fact"|"decision"|"pattern"|"preference"|"event", importance: 0.1-1.0}
- entities: array of {name: "canonical name", type: "person"|"project"|"topic"|"organization"|"place"}

Example: {"memories": [{"content": "Sukhbat decided to pause Blink Studio", "type": "decision", "importance": 0.9}], "entities": [{"name": "Blink Studio", "type": "project"}]}

If nothing worth remembering: {"memories": [], "entities": []}`;

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this conversation exchange and extract key facts, decisions, preferences, patterns, or events worth remembering about the user.

Rules:
- Only extract genuinely memorable information (not small talk or filler)
- Each memory should be a single, clear statement
- Include the user's name if mentioned
- Capture decisions and their reasoning
- Capture preferences, habits, and patterns
- Capture important dates, deadlines, and events
- Capture emotional states or concerns only if significant
- Also extract named entities: specific people, projects, organizations, topics, or places mentioned
- Do NOT extract generic concepts ("AI", "code", "database") as entities — only specific named things

Return a JSON object with:
- memories: array of {content: string, type: "fact"|"decision"|"pattern"|"preference"|"event", importance: 0.1-1.0}
- entities: array of {name: "canonical name", type: "person"|"project"|"topic"|"organization"|"place"}

Example: {"memories": [{"content": "Sukhbat decided to use Voyage AI for embeddings", "type": "decision", "importance": 0.7}], "entities": [{"name": "Voyage AI", "type": "organization"}]}

If nothing worth remembering: {"memories": [], "entities": []}`;

const JOURNAL_EXTRACTION_PROMPT = `You are a personal journal memory extraction system. Analyze this voice journal entry and extract meaningful personal memories.

Rules:
- Focus on feelings, reflections, goals, intentions, and personal observations
- Capture what the person is thinking about, worrying about, or excited about
- Extract any commitments, plans, or decisions mentioned
- Capture relationships and interactions mentioned (who they talked to, about what)
- Write each memory as a warm, personal statement (not clinical or technical)
- Aim for 2-6 quality memories — don't force extraction from simple entries
- If the entry is just a quick thought, extract 1-2 memories
- Also extract named entities: specific people, projects, organizations, topics, or places mentioned

Return a JSON object with:
- memories: array of {content: string, type: "fact"|"decision"|"pattern"|"preference"|"event", importance: 0.3-1.0}
- entities: array of {name: "canonical name", type: "person"|"project"|"topic"|"organization"|"place"}

Example: {"memories": [{"content": "Sukhbat is feeling good about the jewelry platform launch", "type": "fact", "importance": 0.6}], "entities": [{"name": "Jewelry Platform", "type": "project"}]}

If nothing worth remembering: {"memories": [], "entities": []}`;

export class MemoryExtractor {
  private backend: AIBackend;
  private memoryService: MemoryService;
  private entityService?: EntityService;

  constructor(memoryService: MemoryService, backend: AIBackend, entityService?: EntityService) {
    this.backend = backend;
    this.memoryService = memoryService;
    this.entityService = entityService;
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

IMPORTANT: Respond ONLY with the JSON object. Do NOT use any tools. Do NOT try to read, write, or edit any files. Just output the JSON.
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

      // Parse response — supports both new {memories, entities} and legacy [memories] format
      const { memories: extracted, entities: extractedEntities } = this.parseExtraction(text);

      if (extracted.length === 0) return;

      // Store each extracted memory and collect IDs for entity linking
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

      // Link extracted entities to stored memories
      this.linkEntities(extractedEntities, storedIds).catch((err) => {
        console.error("[memory] Entity linking failed:", err instanceof Error ? err.message : err);
      });

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
   * Extract memories from a full conversation session (e.g., after a Telegram thread closes).
   * Summarizes the entire thread rather than individual exchanges.
   */
  async extractSession(
    turns: { role: "user" | "assistant"; content: string }[]
  ): Promise<void> {
    if (turns.length < 2) return; // Nothing meaningful to extract

    try {
      // Build transcript (skip very short turns like "hi", "ok", "thanks")
      const transcript = turns
        .filter((t) => t.content.length > 10)
        .map((t) => `${t.role === "user" ? "Sukhbat" : "BODHI"}: ${t.content}`)
        .join("\n\n");

      if (transcript.length < 100) return;

      const fullPrompt = `<system>
${SESSION_EXTRACTION_PROMPT}

IMPORTANT: Respond ONLY with the JSON object. Do NOT use any tools. Just output the JSON.
</system>

Telegram session transcript:
${transcript.slice(0, 8000)}`; // Cap at 8k chars to avoid huge prompts

      console.log("[memory] Extracting session memories from closed thread...");

      const task = await this.backend.execute(fullPrompt, {
        model: "sonnet",
        tools: "",
        noSessionPersistence: true,
      });

      const text = task.result || task.error || "";
      const { memories: extracted, entities: extractedEntities } = this.parseExtraction(text);

      if (extracted.length === 0) return;

      const storedIds: string[] = [];
      for (const memory of extracted) {
        const id = await this.memoryService.store({
          content: memory.content,
          type: memory.type,
          source: "extraction",
          importance: memory.importance,
          tags: ["telegram-session", "auto-session-save"],
        });
        storedIds.push(id);
      }

      console.log(`[memory] Session extraction: stored ${extracted.length} memories from thread`);

      this.linkEntities(extractedEntities, storedIds).catch(() => {});
      this.crossReference(extracted).catch(() => {});
    } catch (error) {
      console.error(
        "[memory] Session extraction failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Extract memories from a voice journal entry.
   * Uses a journal-specific prompt optimized for personal reflections.
   */
  async extractJournal(transcript: string): Promise<number> {
    if (transcript.length < 20) return 0;

    try {
      const fullPrompt = `<system>
${JOURNAL_EXTRACTION_PROMPT}

IMPORTANT: Respond ONLY with the JSON object. Do NOT use any tools. Just output the JSON.
</system>

Voice journal entry:
${transcript.slice(0, 6000)}`;

      console.log("[memory] Extracting journal memories...");

      const task = await this.backend.execute(fullPrompt, {
        model: "sonnet",
        tools: "",
        noSessionPersistence: true,
      });

      const text = task.result || task.error || "";
      const { memories: extracted, entities: extractedEntities } = this.parseExtraction(text);

      if (extracted.length === 0) return 0;

      const storedIds: string[] = [];
      for (const memory of extracted) {
        const id = await this.memoryService.store({
          content: memory.content,
          type: memory.type,
          source: "manual",
          importance: memory.importance,
          tags: ["journal", "voice-journal"],
        });
        storedIds.push(id);
      }

      console.log(`[memory] Journal extraction: stored ${extracted.length} memories`);

      this.linkEntities(extractedEntities, storedIds).catch(() => {});
      this.crossReference(extracted).catch(() => {});
      return extracted.length;
    } catch (error) {
      console.error(
        "[memory] Journal extraction failed:",
        error instanceof Error ? error.message : error
      );
      return 0;
    }
  }

  /**
   * Parse extraction response — handles both new {memories, entities} format
   * and legacy [memories] array format for backward compatibility.
   */
  private parseExtraction(text: string): {
    memories: Array<{ content: string; type: MemoryInput["type"]; importance: number }>;
    entities: Array<{ name: string; type: string }>;
  } {
    // Try object format first: {"memories": [...], "entities": [...]}
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed.memories && Array.isArray(parsed.memories)) {
          return {
            memories: parsed.memories,
            entities: Array.isArray(parsed.entities) ? parsed.entities : [],
          };
        }
      } catch {
        // Fall through to array format
      }
    }

    // Legacy array format: [{"content": ..., "type": ..., "importance": ...}]
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) {
          return { memories: parsed, entities: [] };
        }
      } catch {
        // Parse failed
      }
    }

    return { memories: [], entities: [] };
  }

  /**
   * Link extracted entities to stored memory IDs.
   * Non-fatal — entity linking failure should never break memory extraction.
   */
  private async linkEntities(
    extractedEntities: Array<{ name: string; type: string }>,
    storedMemoryIds: string[]
  ): Promise<void> {
    if (!this.entityService || extractedEntities.length === 0 || storedMemoryIds.length === 0) return;

    for (const ent of extractedEntities) {
      if (!ent.name || !ent.type) continue;

      try {
        const entity = await this.entityService.findOrCreate(
          ent.name,
          ent.type as EntityType
        );

        // Link entity to all memories in this extraction batch
        for (const memoryId of storedMemoryIds) {
          await this.entityService.linkToMemory(entity.id, memoryId);
        }
      } catch (err) {
        console.error(
          `[memory] Failed to link entity "${ent.name}":`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(`[memory] Linked ${extractedEntities.length} entities to ${storedMemoryIds.length} memories`);
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
