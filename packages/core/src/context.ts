// ============================================================
// BODHI — Context Engine
// Orchestrates multiple ContextProviders into a ContextSnapshot
// ============================================================

import type {
  ContextProvider,
  ContextFragment,
  ContextSnapshot,
} from "./types.js";

export class ContextEngine {
  private providers: ContextProvider[] = [];

  register(provider: ContextProvider): void {
    this.providers.push(provider);
    // Sort by priority descending (higher = more important)
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  async gather(
    message: string,
    budgetTokens = 2000
  ): Promise<ContextSnapshot> {
    // Gather fragments from all providers in parallel
    const fragments = await Promise.all(
      this.providers.map(async (provider) => {
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
      if (totalTokens + fragment.tokenEstimate > budgetTokens) break;
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
