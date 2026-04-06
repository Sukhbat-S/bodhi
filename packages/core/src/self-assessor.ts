// ============================================================
// BODHI — Self-Assessor
// Rates agent response quality 1-5 after each message
// Env-gated: BODHI_SELF_ASSESS=true to enable
// ============================================================

import type { AIBackend } from "./types.js";

const ASSESSMENT_PROMPT = `You are a response quality assessor. Rate the assistant response on a 1-5 scale.

5 = Fully addresses the question with relevant, accurate context
4 = Good response, minor gaps or could be more specific
3 = Adequate but missing important details or context
2 = Partially addresses the question, significant gaps
1 = Misses the point, hallucinated, or unhelpful

Respond ONLY with JSON: {"score": N, "reasoning": "brief explanation (max 30 words)"}
Do NOT use any tools.`;

export interface SelfAssessment {
  score: number;
  reasoning: string;
}

export class SelfAssessor {
  private backend: AIBackend;

  constructor(backend: AIBackend) {
    this.backend = backend;
  }

  async assess(
    userMessage: string,
    assistantResponse: string
  ): Promise<SelfAssessment> {
    const prompt = `<system>\n${ASSESSMENT_PROMPT}\n</system>\n\nUser message: ${userMessage.slice(0, 500)}\n\nAssistant response: ${assistantResponse.slice(0, 1500)}`;

    const task = await this.backend.execute(prompt, {
      model: "sonnet",
      tools: "",
      noSessionPersistence: true,
    });

    const text = task.result || "";
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) {
      return { score: 3, reasoning: "Could not parse self-assessment" };
    }

    try {
      const parsed = JSON.parse(match[0]);
      const score = Math.max(1, Math.min(5, Math.round(parsed.score || 3)));
      return {
        score,
        reasoning: String(parsed.reasoning || "").slice(0, 200),
      };
    } catch {
      return { score: 3, reasoning: "Could not parse self-assessment" };
    }
  }
}
