// ============================================================
// BODHI — CLAUDE.md Section Parser
// Parses markdown into sections and extracts the most relevant
// ones for a given user message. Avoids injecting 700+ lines.
// ============================================================

export interface Section {
  heading: string;
  content: string;
  level: number; // 1 = #, 2 = ##, 3 = ###
  tokenEstimate: number;
}

/**
 * Headings to skip — these contain verbose listings
 * that are too long and low-signal for chat context.
 */
const SKIP_HEADINGS = [
  "api routes",
  "project structure",
  "components",
  "files changed",
  "route groups",
  "session logging",
  "development roadmap",
  "custom slash commands",
  "hooks",
  "permissions",
  "environment variables",
  "commit convention",
  "development tools",
];

/**
 * Headings that are always included when a project matches —
 * they contain critical patterns and rules.
 */
const ALWAYS_INCLUDE_PATTERNS = [
  "critical",
  "key patterns",
  "known issues",
];

/**
 * Parse a CLAUDE.md file into sections by ## headings.
 */
export function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch) {
      // Save the previous section
      if (currentHeading) {
        const content = currentContent.join("\n").trim();
        sections.push({
          heading: currentHeading,
          content,
          level: currentLevel,
          tokenEstimate: Math.ceil(content.length / 4),
        });
      }

      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentHeading) {
    const content = currentContent.join("\n").trim();
    sections.push({
      heading: currentHeading,
      content,
      level: currentLevel,
      tokenEstimate: Math.ceil(content.length / 4),
    });
  }

  return sections;
}

/**
 * Score a section's relevance to a user message.
 * Returns a number (higher = more relevant).
 */
export function scoreSection(section: Section, messageWords: string[]): number {
  const headingLower = section.heading.toLowerCase();

  // Skip verbose sections
  if (SKIP_HEADINGS.some((skip) => headingLower.includes(skip))) {
    return -1; // Explicitly excluded
  }

  let score = 0;

  // Always-include sections get a base score
  if (ALWAYS_INCLUDE_PATTERNS.some((p) => headingLower.includes(p))) {
    score += 5;
  }

  // Heading word match = 3x weight
  const headingWords = headingLower.split(/\W+/).filter(Boolean);
  for (const word of messageWords) {
    if (headingWords.includes(word)) {
      score += 3;
    }
  }

  // Body keyword match = 1x weight per unique match
  const contentLower = section.content.toLowerCase();
  const matchedBodyWords = new Set<string>();
  for (const word of messageWords) {
    if (word.length >= 3 && contentLower.includes(word) && !matchedBodyWords.has(word)) {
      matchedBodyWords.add(word);
      score += 1;
    }
  }

  return score;
}

/**
 * Extract the most relevant sections from a parsed CLAUDE.md,
 * staying within a token budget.
 */
export function extractRelevant(
  sections: Section[],
  message: string,
  maxTokens: number = 1200,
): string {
  // Tokenize message into lowercase words
  const messageWords = message
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 2);

  // Score and sort sections
  const scored = sections
    .map((section) => ({
      section,
      score: scoreSection(section, messageWords),
    }))
    .filter((s) => s.score > 0) // Skip irrelevant and excluded sections
    .sort((a, b) => b.score - a.score);

  // Take top sections within budget
  let totalTokens = 0;
  const selected: Section[] = [];

  for (const { section } of scored) {
    if (totalTokens + section.tokenEstimate > maxTokens) {
      // If the section is too big, try to truncate it
      const remainingTokens = maxTokens - totalTokens;
      if (remainingTokens > 100) {
        // Include a truncated version
        const truncatedContent = section.content.slice(0, remainingTokens * 4);
        selected.push({
          ...section,
          content: truncatedContent + "\n...(truncated)",
          tokenEstimate: remainingTokens,
        });
        totalTokens += remainingTokens;
      }
      break;
    }

    selected.push(section);
    totalTokens += section.tokenEstimate;
  }

  if (selected.length === 0) {
    return "";
  }

  // Format as readable text
  return selected
    .map((s) => {
      const prefix = "#".repeat(s.level);
      return `${prefix} ${s.heading}\n${s.content}`;
    })
    .join("\n\n---\n\n");
}
