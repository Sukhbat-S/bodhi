// ============================================================
// BODHI — Context Engine
// Orchestrates multiple ContextProviders into a ContextSnapshot
// Intent-aware: classifies messages to select relevant providers
// ============================================================

import type {
  ContextProvider,
  ContextFragment,
  ContextSnapshot,
} from "./types.js";

// Intent → which provider names to include + token budget
type Intent = "quick" | "code" | "memory" | "full";

const INTENT_CONFIG: Record<Intent, { providers: Set<string>; budget: number }> = {
  quick:  { providers: new Set(["calendar", "gmail"]), budget: 2000 },
  code:   { providers: new Set(["memory", "goals", "github", "vercel", "supabase"]), budget: 6000 },
  memory: { providers: new Set(["memory", "goals", "entities", "projects"]), budget: 8000 },
  full:   { providers: new Set(), budget: 16000 }, // empty = all providers
};

const INTENT_PATTERNS: Array<{ intent: Intent; pattern: RegExp }> = [
  { intent: "quick",  pattern: /\b(schedule|calendar|meeting|event|free.?time|today|tomorrow|what.?time)\b/i },
  { intent: "quick",  pattern: /\b(inbox|email|unread|mail)\b/i },
  { intent: "code",   pattern: /\b(deploy|build|vercel|commit|PR|pull.?request|push|branch|github|supabase|migration)\b/i },
  { intent: "memory", pattern: /\b(remember|decided|decision|pattern|learned|recall|what.?did|last.?time|preference)\b/i },
];

function detectIntent(message: string): Intent {
  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(message)) return intent;
  }
  return "full";
}

export class ContextEngine {
  private providers: ContextProvider[] = [];

  register(provider: ContextProvider): void {
    this.providers.push(provider);
    // Sort by priority descending (higher = more important)
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  async gather(
    message: string,
    budgetTokens?: number
  ): Promise<ContextSnapshot> {
    const intent = detectIntent(message);
    const config = INTENT_CONFIG[intent];
    const budget = budgetTokens ?? config.budget;

    // Filter providers by intent (empty set = all providers)
    const active = config.providers.size > 0
      ? this.providers.filter((p) => config.providers.has(p.name))
      : this.providers;

    if (intent !== "full") {
      console.log(`[context] Intent: ${intent} → ${active.length}/${this.providers.length} providers, ${budget} token budget`);
    }

    // Gather fragments from selected providers in parallel
    const fragments = await Promise.all(
      active.map(async (provider) => {
        try {
          const fragment = await provider.gather(message);
          return fragment;
        } catch (error) {
          console.error(
            `[context] Provider "${provider.name}" failed:`,
            error instanceof Error ? error.message : error
          );
          return null;
        }
      })
    );

    // Filter out nulls and empty fragments
    const valid = fragments.filter(
      (f): f is ContextFragment =>
        f !== null && f.content.length > 0 && f.relevance > 0
    );

    // Sort by relevance descending
    valid.sort((a, b) => b.relevance - a.relevance);

    // Trim to budget
    let totalTokens = 0;
    const included: ContextFragment[] = [];

    for (const fragment of valid) {
      if (totalTokens + fragment.tokenEstimate > budget) break;
      included.push(fragment);
      totalTokens += fragment.tokenEstimate;
    }

    return {
      fragments: included,
      totalTokens,
      timestamp: new Date(),
    };
  }
}
