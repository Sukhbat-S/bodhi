// ============================================================
// BODHI — System Prompt Builder
// Dynamically composes the system prompt from persona + context
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { ContextSnapshot } from "./types.js";

let cachedPersona: string | undefined;

export function loadPersona(personaPath: string): string {
  if (cachedPersona) return cachedPersona;
  cachedPersona = fs.readFileSync(personaPath, "utf-8");
  return cachedPersona;
}

export function clearPersonaCache(): void {
  cachedPersona = undefined;
}

export function buildSystemPrompt(
  persona: string,
  context?: ContextSnapshot
): string {
  let prompt = persona;

  if (context && context.fragments.length > 0) {
    prompt += "\n\n---\n\n## Current Context\n\n";

    // Sort by relevance descending
    const sorted = [...context.fragments].sort(
      (a, b) => b.relevance - a.relevance
    );

    for (const fragment of sorted) {
      prompt += `### ${fragment.provider}\n${fragment.content}\n\n`;
    }
  }

  // Add timestamp
  const now = new Date();
  const ubTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ulaanbaatar",
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  prompt += `\n---\n\nCurrent time: ${ubTime} (Ulaanbaatar, UTC+8)\n`;

  return prompt;
}
