#!/usr/bin/env npx tsx
// ============================================================
// BODHI — Session Log Backfill Script
//
// Reads session log markdown files from the jewelry platform,
// extracts individual learnings (patterns, root causes, failed
// approaches, decisions, bugs), and stores each as a separate
// memory in BODHI's pgvector database.
//
// Usage:
//   npx tsx scripts/backfill-session-logs.ts --dry-run
//   npx tsx scripts/backfill-session-logs.ts
//   npx tsx scripts/backfill-session-logs.ts --sessions 025-053
//   npx tsx scripts/backfill-session-logs.ts --verbose
// ============================================================

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────

const SESSION_LOGS_DIR =
  "/Users/macbookpro/Documents/jewelry-platform/session-logs";
const BODHI_API_URL = "http://localhost:4000";
const API_BATCH_SIZE = 40; // Memories per batch API call (max 128, but conservative for Voyage AI tokens)
const BATCH_DELAY_MS = 20_000; // 20s delay between batches (stay well under Voyage AI RPM limit)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30_000; // 30s pause on retry
const MAX_CONTENT_LENGTH = 2000;
const MIN_CONTENT_LENGTH = 20;

// ── Types ───────────────────────────────────────────────────

interface ParsedSession {
  number: number;
  date: string;
  title: string;
  filename: string;
  sections: Map<string, SectionContent>;
}

interface SectionContent {
  originalHeading: string;
  body: string;
  bullets: string[];
  tableRows: string[][];
  subsections: SubSection[];
}

interface SubSection {
  heading: string;
  body: string;
  keyValues: Map<string, string>; // "Problem" → "...", "Diagnosis" → "..."
}

interface RawMemory {
  content: string;
  type: "fact" | "decision" | "pattern" | "preference" | "event";
  importance: number;
  tags: string[];
  source: string; // for logging: "session-025/patterns/2"
}

interface MemoryPayload {
  content: string;
  type: string;
  importance: number;
  tags: string[];
}

interface Args {
  dryRun: boolean;
  verbose: boolean;
  sessionsRange: [number, number] | null;
  apiUrl: string;
}

// ── Section Name Normalization ──────────────────────────────

const SECTION_ALIASES: Record<string, string> = {
  // Summaries
  summary: "summary",
  context: "summary",
  focus: "summary",
  overview: "summary",

  // V1 "What Happened" → treated as PDS chains (has ### subsections)
  "what happened": "pds_chains",
  "what we did": "pds_chains",

  // Problem→Solution chains (various arrow styles)
  "problem → diagnosis → solution": "pds_chains",
  "problem -> diagnosis -> solution": "pds_chains",
  "problem → diagnosis → solution chains": "pds_chains",
  "problem -> diagnosis -> solution chains": "pds_chains",
  "root cause analysis": "pds_chains",
  "issues & solutions": "pds_chains",
  "issues encountered & solutions": "pds_chains",
  "issues & fixes": "pds_chains",

  // Patterns
  "patterns discovered": "patterns",
  "key learnings": "patterns",
  "key learning": "patterns",
  "patterns & learnings": "patterns",
  "what we learned": "patterns",

  // Failed approaches
  "failed approaches": "failed_approaches",
  "failed approaches & dead ends": "failed_approaches",
  "what didn't work": "failed_approaches",

  // Root causes
  "root causes (tagged)": "root_causes",
  "root causes": "root_causes",
  "root causes encountered": "root_causes",

  // Decisions
  "key decisions": "decisions",
  "architecture decisions": "decisions",
  "decisions made": "decisions",
  "decisions": "decisions",

  // Bugs
  "bugs found": "bugs",
  "bugs found & fixed": "bugs",
  "bugs": "bugs",

  // Cross-session (lower priority)
  "cross-session connections": "cross_session",
  "cross-session links": "cross_session",
};

/**
 * Normalize a heading to a canonical section key.
 * Strips trailing parenthetical, lowercases, looks up alias.
 */
function normalizeHeading(heading: string): string | null {
  let h = heading.toLowerCase().trim();
  // Strip trailing parenthetical: "Bugs Found (0)" → "bugs found"
  h = h.replace(/\s*\(.*\)\s*$/, "");
  // Strip trailing colon
  h = h.replace(/:\s*$/, "");

  // Direct match
  if (SECTION_ALIASES[h]) return SECTION_ALIASES[h];

  // Partial match (heading contains an alias key)
  for (const [alias, canonical] of Object.entries(SECTION_ALIASES)) {
    if (h.includes(alias)) return canonical;
  }

  return null;
}

// ── Phase 1: PARSE ──────────────────────────────────────────

function discoverSessionLogs(
  dir: string,
  range: [number, number] | null,
): string[] {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("SESSION-") && f.endsWith(".md"))
    .sort();

  if (!range) return files;

  const [min, max] = range;
  return files.filter((f) => {
    const match = f.match(/SESSION-(\d+)/);
    if (!match) return false;
    const num = parseInt(match[1], 10);
    return num >= min && num <= max;
  });
}

function parseSessionLog(filepath: string): ParsedSession {
  const content = readFileSync(filepath, "utf-8");
  const filename = filepath.split("/").pop()!;

  // Extract session number from filename: SESSION-025_...
  const numMatch = filename.match(/SESSION-(\d+)/);
  const number = numMatch ? parseInt(numMatch[1], 10) : 0;

  // Extract date from filename: SESSION-025_2026-02-22_...
  const dateMatch = filename.match(/\d{4}-\d{2}-\d{2}/);
  const date = dateMatch ? dateMatch[0] : "unknown";

  // Extract title from first # heading
  const titleMatch = content.match(/^#\s+.*?—\s*(?:\d{4}-\d{2}-\d{2}\s*—\s*)?(.+)/m);
  const title = titleMatch
    ? titleMatch[1].trim()
    : filename.replace(/SESSION-\d+_\d{4}-\d{2}-\d{2}_/, "").replace(".md", "").replace(/-/g, " ");

  // Parse sections by ## headings
  const sections = new Map<string, SectionContent>();
  const lines = content.split("\n");

  let currentHeading = "";
  let currentOriginal = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      // Save previous section
      if (currentHeading) {
        const canonical = normalizeHeading(currentHeading);
        if (canonical) {
          sections.set(canonical, parseSectionBody(currentOriginal, currentLines));
        }
      }
      currentHeading = h2Match[1].trim();
      currentOriginal = currentHeading;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Last section
  if (currentHeading) {
    const canonical = normalizeHeading(currentHeading);
    if (canonical) {
      sections.set(canonical, parseSectionBody(currentOriginal, currentLines));
    }
  }

  return { number, date, title, filename, sections };
}

function parseSectionBody(heading: string, lines: string[]): SectionContent {
  const body = lines.join("\n").trim();
  const bullets: string[] = [];
  const tableRows: string[][] = [];
  const subsections: SubSection[] = [];

  let currentSubHeading = "";
  let currentSubLines: string[] = [];
  let inTable = false;
  let tableHeaderSeen = false;

  for (const line of lines) {
    // ### subsection detection
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      // Save previous subsection
      if (currentSubHeading) {
        subsections.push(parseSubSection(currentSubHeading, currentSubLines));
      }
      currentSubHeading = h3Match[1].trim();
      currentSubLines = [];
      continue;
    }

    if (currentSubHeading) {
      currentSubLines.push(line);
      continue;
    }

    // Top-level bullets
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim());
    }

    // Table rows
    if (line.startsWith("|")) {
      if (line.includes("---")) {
        tableHeaderSeen = true;
        continue;
      }
      if (!tableHeaderSeen && line.toLowerCase().includes("bug")) {
        inTable = true;
        continue; // Skip header row
      }
      if (inTable || tableHeaderSeen) {
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length >= 2) {
          tableRows.push(cells);
        }
      }
    } else if (!line.trim()) {
      // Empty line resets table context only if no header was seen
    }
  }

  // Last subsection
  if (currentSubHeading) {
    subsections.push(parseSubSection(currentSubHeading, currentSubLines));
  }

  return { originalHeading: heading, body, bullets, tableRows, subsections };
}

function parseSubSection(heading: string, lines: string[]): SubSection {
  const body = lines.join("\n").trim();
  const keyValues = new Map<string, string>();

  for (const line of lines) {
    // Match "- **Problem:** ..." or "- **Root Cause:** ..."
    const kvMatch = line.match(/^[-*]\s+\*\*(.+?):\*\*\s*(.*)/);
    if (kvMatch) {
      keyValues.set(kvMatch[1].trim().toLowerCase(), kvMatch[2].trim());
    }
  }

  return { heading, body, keyValues };
}

// ── Phase 2: EXTRACT ────────────────────────────────────────

function extractMemories(session: ParsedSession): RawMemory[] {
  const memories: RawMemory[] = [];
  const sn = session.number;

  // Summary → one memory
  const summary = session.sections.get("summary");
  if (summary) {
    const text = summary.body
      .replace(/^[\s\n]*/, "")
      .split("\n")
      .filter(
        (l) => l.trim() && !l.startsWith("**") && !l.startsWith("|") && !l.startsWith("#"),
      )
      .join(" ")
      .slice(0, 500);
    if (text.length >= MIN_CONTENT_LENGTH) {
      memories.push({
        content: text,
        type: "fact",
        importance: 0.6,
        tags: [],
        source: `session-${String(sn).padStart(3, "0")}/summary`,
      });
    }
  }

  // PDS chains → one memory per subsection
  const pds = session.sections.get("pds_chains");
  if (pds) {
    for (let i = 0; i < pds.subsections.length; i++) {
      const sub = pds.subsections[i];
      const kv = sub.keyValues;

      let content: string;
      const problem = kv.get("problem") || kv.get("symptom") || "";
      const diagnosis =
        kv.get("diagnosis") || kv.get("root cause") || kv.get("root-cause") || "";
      const solution = kv.get("solution") || kv.get("fix") || "";

      if (problem || diagnosis || solution) {
        const parts: string[] = [];
        if (problem) parts.push(`Problem: ${problem}`);
        if (diagnosis) parts.push(`Diagnosis: ${diagnosis}`);
        if (solution) parts.push(`Solution: ${solution}`);
        content = `${sub.heading} — ${parts.join(". ")}`;
      } else {
        // V1 format — prose body, take first 400 chars
        content = `${sub.heading}: ${sub.body.slice(0, 400)}`;
      }

      if (content.length >= MIN_CONTENT_LENGTH) {
        memories.push({
          content,
          type: "fact",
          importance: 0.8,
          tags: [],
          source: `session-${String(sn).padStart(3, "0")}/pds/${i}`,
        });
      }
    }
  }

  // Patterns → one memory per bullet
  const patterns = session.sections.get("patterns");
  if (patterns) {
    for (let i = 0; i < patterns.bullets.length; i++) {
      const bullet = cleanBullet(patterns.bullets[i]);
      if (bullet.length >= MIN_CONTENT_LENGTH) {
        memories.push({
          content: bullet,
          type: "pattern",
          importance: 0.85,
          tags: [],
          source: `session-${String(sn).padStart(3, "0")}/patterns/${i}`,
        });
      }
    }
  }

  // Root causes → one memory per bullet, extract tags
  const rootCauses = session.sections.get("root_causes");
  if (rootCauses) {
    for (let i = 0; i < rootCauses.bullets.length; i++) {
      const { cleanText, tags } = extractInlineTags(rootCauses.bullets[i]);
      if (cleanText.length >= MIN_CONTENT_LENGTH) {
        memories.push({
          content: cleanText,
          type: "fact",
          importance: 0.8,
          tags,
          source: `session-${String(sn).padStart(3, "0")}/root_causes/${i}`,
        });
      }
    }
  }

  // Failed approaches → one memory per bullet
  const failed = session.sections.get("failed_approaches");
  if (failed) {
    for (let i = 0; i < failed.bullets.length; i++) {
      const bullet = cleanBullet(failed.bullets[i]);
      if (bullet.length >= MIN_CONTENT_LENGTH) {
        memories.push({
          content: bullet,
          type: "fact",
          importance: 0.75,
          tags: [],
          source: `session-${String(sn).padStart(3, "0")}/failed/${i}`,
        });
      }
    }
  }

  // Decisions → one memory per bullet
  const decisions = session.sections.get("decisions");
  if (decisions) {
    // Handle both bullets and numbered items
    const items =
      decisions.bullets.length > 0
        ? decisions.bullets
        : decisions.body
            .split("\n")
            .filter((l) => l.match(/^\d+\.\s+/))
            .map((l) => l.replace(/^\d+\.\s+/, ""));

    for (let i = 0; i < items.length; i++) {
      const item = cleanBullet(items[i]);
      if (item.length >= MIN_CONTENT_LENGTH) {
        memories.push({
          content: item,
          type: "decision",
          importance: 0.85,
          tags: [],
          source: `session-${String(sn).padStart(3, "0")}/decisions/${i}`,
        });
      }
    }
  }

  // Bugs → one memory per table row
  const bugs = session.sections.get("bugs");
  if (bugs) {
    for (let i = 0; i < bugs.tableRows.length; i++) {
      const row = bugs.tableRows[i];
      if (row.length >= 3) {
        const bug = row[0];
        const rootCause = row[1];
        const fix = row[2];
        // Skip rows that look like empty placeholders
        if (bug && !bug.startsWith("---") && bug.length > 3) {
          const content = `Bug: ${bug}. Root cause: ${rootCause}. Fix: ${fix}`;
          memories.push({
            content,
            type: "fact",
            importance: 0.7,
            tags: ["bug-fix"],
            source: `session-${String(sn).padStart(3, "0")}/bugs/${i}`,
          });
        }
      }
    }
  }

  return memories;
}

// ── Phase 3: TRANSFORM ──────────────────────────────────────

function transformMemory(
  raw: RawMemory,
  session: ParsedSession,
): MemoryPayload | null {
  let content = raw.content.trim();

  // Prefix with project name
  if (!content.toLowerCase().startsWith("jewelry platform")) {
    content = `Jewelry platform: ${content}`;
  }

  // Append session reference
  content = `${content} (Session ${String(session.number).padStart(3, "0")})`;

  // Truncate if too long
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH - 20) + "... (truncated)";
  }

  // Skip trivial
  if (content.length < MIN_CONTENT_LENGTH + 30) return null; // +30 for prefix + suffix

  // Build tags
  const baseTags = [
    `session-${String(session.number).padStart(3, "0")}`,
    "jewelry-platform",
    "claude-code",
    "backfill",
  ];
  const allTags = [...new Set([...baseTags, ...raw.tags])];

  return {
    content,
    type: raw.type,
    importance: raw.importance,
    tags: allTags,
  };
}

// ── Phase 4: LOAD (Batch) ───────────────────────────────────

interface BatchResult {
  ok: boolean;
  stored?: number;
  ids?: string[];
  error?: string;
}

async function postBatch(
  payloads: MemoryPayload[],
  apiUrl: string,
): Promise<BatchResult> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${apiUrl}/api/memories/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memories: payloads }),
      });

      if (response.ok) {
        const data = (await response.json()) as { stored: number; ids: string[] };
        return { ok: true, stored: data.stored, ids: data.ids };
      }

      if (response.status === 429 || response.status >= 500) {
        const statusText = response.status === 429 ? "Rate limited" : `Server error ${response.status}`;
        console.error(
          `\n  ⚠ ${statusText}. Retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // Client error (4xx) — don't retry
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `${response.status}: ${body || response.statusText}`,
      };
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.error(
          `\n  ⚠ Network error. Retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return {
        ok: false,
        error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { ok: false, error: "Max retries exceeded" };
}

// ── Helpers ─────────────────────────────────────────────────

function cleanBullet(text: string): string {
  return text
    .replace(/^\*\*(.+?):\*\*\s*/, "$1: ") // **Bold:** → Bold:
    .replace(/^`(.+?)`\s*/, "$1 ") // `code` prefix
    .trim();
}

function extractInlineTags(text: string): {
  cleanText: string;
  tags: string[];
} {
  const tags: string[] = [];
  let clean = text;

  // V2: [#tag] pattern
  clean = clean.replace(/\[#([\w-]+)\]/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return "";
  });

  // V1: `[Tag]` pattern
  clean = clean.replace(/`\[([\w-]+)\]`/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return "";
  });

  return { cleanText: clean.trim(), tags };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

// ── CLI Arg Parsing ─────────────────────────────────────────

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    dryRun: false,
    verbose: false,
    sessionsRange: null,
    apiUrl: BODHI_API_URL,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--verbose":
        result.verbose = true;
        break;
      case "--sessions": {
        const range = args[++i];
        if (range) {
          const parts = range.split("-").map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            result.sessionsRange = [parts[0], parts[1]];
          } else if (parts.length === 1 && !isNaN(parts[0])) {
            result.sessionsRange = [parts[0], parts[0]];
          }
        }
        break;
      }
      case "--api-url":
        result.apiUrl = args[++i] || BODHI_API_URL;
        break;
    }
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log("=".repeat(60));
  console.log("  BODHI — Session Log Backfill");
  console.log("=".repeat(60));
  console.log(`  Source: ${SESSION_LOGS_DIR}`);
  console.log(`  API:    ${args.apiUrl}`);
  console.log(`  Mode:   ${args.dryRun ? "DRY RUN" : "LIVE"}`);
  if (args.sessionsRange) {
    console.log(
      `  Range:  Sessions ${pad3(args.sessionsRange[0])}-${pad3(args.sessionsRange[1])}`,
    );
  }
  console.log("=".repeat(60));
  console.log();

  // 1. Discover files
  const files = discoverSessionLogs(SESSION_LOGS_DIR, args.sessionsRange);
  console.log(`Found ${files.length} session logs\n`);

  if (files.length === 0) {
    console.log("No session logs found. Exiting.");
    return;
  }

  // 2. Parse all sessions
  const sessions = files.map((f) => parseSessionLog(join(SESSION_LOGS_DIR, f)));

  // 3. Extract and transform memories
  const allMemories: { payload: MemoryPayload; source: string }[] = [];
  const perSessionCounts: { session: number; count: number }[] = [];

  for (const session of sessions) {
    const rawMemories = extractMemories(session);
    const transformed: { payload: MemoryPayload; source: string }[] = [];

    for (const raw of rawMemories) {
      const payload = transformMemory(raw, session);
      if (payload) {
        transformed.push({ payload, source: raw.source });
      }
    }

    allMemories.push(...transformed);
    perSessionCounts.push({ session: session.number, count: transformed.length });
  }

  // 4. Print extraction summary
  const typeCounts = new Map<string, number>();
  const importanceCounts = new Map<number, number>();
  for (const { payload } of allMemories) {
    typeCounts.set(payload.type, (typeCounts.get(payload.type) || 0) + 1);
    importanceCounts.set(
      payload.importance,
      (importanceCounts.get(payload.importance) || 0) + 1,
    );
  }

  console.log(`Extracted ${allMemories.length} memories from ${sessions.length} sessions\n`);

  console.log("By type:");
  for (const [type, count] of [...typeCounts.entries()].sort()) {
    console.log(`  ${type.padEnd(10)} ${count}`);
  }

  console.log("\nBy importance:");
  for (const [imp, count] of [...importanceCounts.entries()].sort(
    (a, b) => b[0] - a[0],
  )) {
    console.log(`  ${imp.toFixed(2).padEnd(10)} ${count}`);
  }

  console.log("\nPer session:");
  for (const { session, count } of perSessionCounts) {
    if (count > 0 || args.verbose) {
      console.log(`  SESSION-${pad3(session)}: ${count} memories`);
    }
  }

  // 5. Dry run: show samples and exit
  if (args.dryRun) {
    console.log("\n--- SAMPLE MEMORIES (first 10) ---\n");
    for (const { payload, source } of allMemories.slice(0, 10)) {
      console.log(`[${payload.type}/${payload.importance}] ${source}`);
      console.log(`  ${payload.content.slice(0, 120)}...`);
      console.log(`  tags: ${payload.tags.join(", ")}`);
      console.log();
    }
    const estBatches = Math.ceil(allMemories.length / API_BATCH_SIZE);
    console.log(
      `\nDry run complete. Would store ${allMemories.length} memories in ${estBatches} batches.`,
    );
    console.log(
      `Estimated time: ~${Math.ceil((estBatches * BATCH_DELAY_MS) / 60000)} minutes`,
    );
    return;
  }

  // 6. Check BODHI is online
  try {
    const status = await fetch(`${args.apiUrl}/api/status`);
    if (!status.ok) {
      console.error("\nBODHI is not responding. Start it first:");
      console.error(
        "  cd ~/Documents/bodhi && npm run dev -w @seneca/server",
      );
      process.exit(1);
    }
    console.log("\nBODHI is online. Starting import...\n");
  } catch {
    console.error("\nCannot reach BODHI at", args.apiUrl);
    console.error(
      "  cd ~/Documents/bodhi && npm run dev -w @seneca/server",
    );
    process.exit(1);
  }

  // 7. Load into BODHI (batch mode)
  let successes = 0;
  let failures = 0;
  const failedBatches: { batchNum: number; count: number; error: string }[] = [];
  const startTime = Date.now();

  // Split into batches
  const totalBatches = Math.ceil(allMemories.length / API_BATCH_SIZE);
  console.log(`  Sending ${totalBatches} batches of ~${API_BATCH_SIZE} memories each`);
  console.log(`  Estimated time: ~${Math.ceil((totalBatches * BATCH_DELAY_MS) / 60000)} minutes\n`);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * API_BATCH_SIZE;
    const end = Math.min(start + API_BATCH_SIZE, allMemories.length);
    const batch = allMemories.slice(start, end);
    const payloads = batch.map((m) => m.payload);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const remaining = (((totalBatches - batchIdx) * BATCH_DELAY_MS) / 1000).toFixed(0);
    process.stdout.write(
      `\r  Batch ${batchIdx + 1}/${totalBatches} (${batch.length} memories) — ${elapsed}s elapsed, ~${remaining}s remaining   `,
    );

    if (args.verbose) {
      console.log();
      for (const { source, payload } of batch) {
        console.log(`    → ${source}: ${payload.content.slice(0, 80)}...`);
      }
    }

    const result = await postBatch(payloads, args.apiUrl);
    if (result.ok) {
      successes += result.stored || batch.length;
      console.log(`  ✓ ${result.stored || batch.length} stored`);
    } else {
      failures += batch.length;
      failedBatches.push({ batchNum: batchIdx + 1, count: batch.length, error: result.error || "unknown" });
      console.log(`  ✗ Failed: ${result.error}`);
    }

    // Delay between batches (skip delay after last batch)
    if (batchIdx + 1 < totalBatches) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // 8. Print results
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n\n" + "=".repeat(60));
  console.log("  Backfill Complete");
  console.log("=".repeat(60));
  console.log(`  Total:     ${allMemories.length}`);
  console.log(`  Stored:    ${successes}`);
  console.log(`  Failed:    ${failures}`);
  console.log(`  Duration:  ${duration}s`);
  console.log(
    `  Rate:      ${(successes / (parseFloat(duration) || 1)).toFixed(1)} memories/sec`,
  );

  if (failedBatches.length > 0) {
    console.log("\n  Failed batches:");
    for (const { batchNum, count, error } of failedBatches) {
      console.log(`    Batch ${batchNum} (${count} memories): ${error}`);
    }
  }

  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
