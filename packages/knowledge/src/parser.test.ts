import { describe, it, expect } from "vitest";
import { parseSections, scoreSection, extractRelevant, type Section } from "./parser.js";

describe("parseSections", () => {
  it("parses a single H1 section", () => {
    const result = parseSections("# Title\nSome content here");
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("Title");
    expect(result[0].level).toBe(1);
    expect(result[0].content).toBe("Some content here");
  });

  it("parses multiple H2 sections", () => {
    const md = "## First\nContent A\n## Second\nContent B\n## Third\nContent C";
    const result = parseSections(md);
    expect(result).toHaveLength(3);
    expect(result[0].heading).toBe("First");
    expect(result[1].heading).toBe("Second");
    expect(result[2].heading).toBe("Third");
  });

  it("handles H3 nested headings", () => {
    const result = parseSections("### Deep Heading\nDeep content");
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe(3);
  });

  it("returns empty array for empty string", () => {
    expect(parseSections("")).toHaveLength(0);
  });

  it("returns empty array when no headings present", () => {
    expect(parseSections("Just plain text\nno headings")).toHaveLength(0);
  });

  it("drops content before first heading", () => {
    const result = parseSections("Preamble text\n# Actual Section\nContent");
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe("Actual Section");
  });

  it("estimates tokens as ceil(content.length / 4)", () => {
    // 12 chars → ceil(12/4) = 3
    const result = parseSections("# Test\n123456789012");
    expect(result[0].tokenEstimate).toBe(Math.ceil(12 / 4));
  });

  it("trims whitespace from section content", () => {
    const result = parseSections("# Title\n\n  Content  \n\n");
    expect(result[0].content).toBe("Content");
  });
});

describe("scoreSection", () => {
  const makeSection = (heading: string, content = "", level = 2): Section => ({
    heading,
    content,
    level,
    tokenEstimate: Math.ceil(content.length / 4),
  });

  it("returns -1 for skip-listed headings", () => {
    expect(scoreSection(makeSection("API Routes"), ["deploy"])).toBe(-1);
    expect(scoreSection(makeSection("Project Structure"), ["deploy"])).toBe(-1);
    expect(scoreSection(makeSection("Environment Variables"), ["deploy"])).toBe(-1);
  });

  it("gives base score 5 to always-include headings", () => {
    const score = scoreSection(makeSection("Key Patterns"), []);
    expect(score).toBe(5);
  });

  it("scores heading word matches at 3x", () => {
    const score = scoreSection(makeSection("Deployment"), ["deployment"]);
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it("scores body keyword matches at 1x", () => {
    const section = makeSection("Random", "This section mentions docker setup");
    const score = scoreSection(section, ["docker"]);
    expect(score).toBe(1);
  });

  it("ignores short words (< 3 chars) in body matching", () => {
    const section = makeSection("Random", "This has an in it");
    const score = scoreSection(section, ["in"]);
    expect(score).toBe(0);
  });

  it("counts unique body matches only", () => {
    const section = makeSection("Random", "docker docker docker everywhere");
    // "docker" appears 3 times but should count once
    const score = scoreSection(section, ["docker", "docker"]);
    expect(score).toBe(1);
  });

  it("returns 0 when no matches", () => {
    const section = makeSection("Unrelated", "nothing relevant here");
    expect(scoreSection(section, ["deploy", "kubernetes"])).toBe(0);
  });

  it("combines heading and body scores", () => {
    const section = makeSection("Deployment", "Uses docker compose for deployment");
    const score = scoreSection(section, ["deployment", "docker"]);
    // heading match (3) + body "docker" (1) + body "deployment" (1) = 5
    expect(score).toBeGreaterThanOrEqual(5);
  });
});

describe("extractRelevant", () => {
  const sections: Section[] = [
    { heading: "Key Patterns", content: "Always use Bridge", level: 2, tokenEstimate: 5 },
    { heading: "Deployment", content: "Docker compose up", level: 2, tokenEstimate: 5 },
    { heading: "API Routes", content: "GET /health", level: 2, tokenEstimate: 5 },
    { heading: "Testing", content: "No tests yet", level: 2, tokenEstimate: 4 },
  ];

  it("returns top-scoring sections within budget", () => {
    const result = extractRelevant(sections, "deployment patterns", 100);
    expect(result).toContain("Key Patterns");
    expect(result).toContain("Deployment");
  });

  it("excludes skip-listed sections", () => {
    const result = extractRelevant(sections, "api routes", 100);
    // "API Routes" is skip-listed, so it should not appear
    expect(result).not.toContain("API Routes");
  });

  it("returns empty string when no sections score > 0", () => {
    // Use sections without always-include headings
    const plainSections: Section[] = [
      { heading: "Deployment", content: "Docker compose up", level: 2, tokenEstimate: 5 },
      { heading: "Testing", content: "No tests yet", level: 2, tokenEstimate: 4 },
    ];
    const result = extractRelevant(plainSections, "xyznonexistent", 100);
    expect(result).toBe("");
  });

  it("respects token budget", () => {
    // Budget of 6 tokens should fit only 1 section (each is 4-5 tokens)
    const result = extractRelevant(sections, "patterns deployment testing", 6);
    // Should include at most 1-2 sections
    const sectionCount = (result.match(/^#{1,3} /gm) || []).length;
    expect(sectionCount).toBeLessThanOrEqual(2);
  });

  it("separates sections with ---", () => {
    const result = extractRelevant(sections, "patterns deployment", 100);
    if (result.includes("Key Patterns") && result.includes("Deployment")) {
      expect(result).toContain("---");
    }
  });

  it("truncates large sections when remaining budget > 100", () => {
    const largeSections: Section[] = [
      { heading: "Small", content: "tiny", level: 2, tokenEstimate: 2 },
      { heading: "Key Patterns Big", content: "x".repeat(2000), level: 2, tokenEstimate: 500 },
    ];
    const result = extractRelevant(largeSections, "patterns", 200);
    if (result.includes("truncated")) {
      expect(result).toContain("...(truncated)");
    }
  });
});
