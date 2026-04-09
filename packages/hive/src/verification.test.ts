// ============================================================
// Tests for the containment checks themselves.
// The auditor gets audited.
// ============================================================

import { describe, it, expect } from "vitest";
import { runContainmentChecks, runAutoChecks } from "./verification.js";

describe("runContainmentChecks", () => {
  it("returns results for all 5 checks", async () => {
    const results = await runContainmentChecks(process.cwd());
    expect(results.length).toBe(5);
    const names = results.map((r) => r.check);
    expect(names).toContain("git-integrity");
    expect(names).toContain("scope-check");
    expect(names).toContain("secret-access");
    expect(names).toContain("new-file-count");
    expect(names).toContain("external-calls");
  });

  it("each check has passed boolean and output string", async () => {
    const results = await runContainmentChecks(process.cwd());
    for (const r of results) {
      expect(typeof r.passed).toBe("boolean");
      expect(typeof r.output).toBe("string");
      expect(typeof r.durationMs).toBe("number");
    }
  });

  it("does not crash on non-git directory", async () => {
    const results = await runContainmentChecks("/tmp");
    expect(results.length).toBe(5);
    // Should still return results (may fail gracefully)
  });
});

// runAutoChecks skipped — tsc + vitest take 120s+ on full monorepo.
// Tested implicitly by the overnight pipeline.
