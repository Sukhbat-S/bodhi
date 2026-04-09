// ============================================================
// The Hive — Verification Mesh
// Parallel automated checks: tsc, tests, lint.
// Runs alongside Sentinel agent reviews.
// ============================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface VerificationResult {
  check: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

/**
 * Run automated verification checks on a worktree or cwd.
 * Returns results for all checks (tsc, tests) in parallel.
 */
export async function runAutoChecks(cwd: string): Promise<VerificationResult[]> {
  const checks = await Promise.allSettled([
    runCheck("tsc", "npx tsc --noEmit 2>&1 | tail -20", cwd),
    runCheck("tests", "npx vitest run --reporter=verbose 2>&1 | tail -30", cwd),
  ]);

  return checks.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { check: "unknown", passed: false, output: String((r as PromiseRejectedResult).reason), durationMs: 0 },
  );
}

async function runCheck(name: string, command: string, cwd: string): Promise<VerificationResult> {
  const start = Date.now();
  try {
    const { stdout } = await execAsync(command, { cwd, timeout: 120_000 });
    return { check: name, passed: true, output: stdout.slice(-500), durationMs: Date.now() - start };
  } catch (err: unknown) {
    const output = (err as { stdout?: string; stderr?: string }).stdout
      || (err as { stderr?: string }).stderr
      || String(err);
    return { check: name, passed: false, output: output.slice(-500), durationMs: Date.now() - start };
  }
}

/**
 * Format verification results into a summary string for Sentinel context.
 */
export function formatResults(results: VerificationResult[]): string {
  return results
    .map((r) => `**${r.check}**: ${r.passed ? "PASS" : "FAIL"} (${r.durationMs}ms)\n${r.output}`)
    .join("\n\n");
}
