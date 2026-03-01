import { describe, it, expect } from "vitest";
import {
  requiresConfirmation,
  validateBudget,
  resolveProject,
  addProject,
} from "./safety.js";

describe("requiresConfirmation", () => {
  it("flags git push", () => {
    expect(requiresConfirmation("git push origin main")).toBe(true);
  });

  it("flags git push --force", () => {
    expect(requiresConfirmation("git push --force")).toBe(true);
  });

  it("flags git reset --hard", () => {
    expect(requiresConfirmation("git reset --hard HEAD~1")).toBe(true);
  });

  it("flags rm -rf", () => {
    expect(requiresConfirmation("rm -rf /tmp/stuff")).toBe(true);
  });

  it("flags DROP TABLE", () => {
    expect(requiresConfirmation("DROP TABLE users")).toBe(true);
  });

  it("flags vercel --prod", () => {
    expect(requiresConfirmation("vercel --prod")).toBe(true);
  });

  it("flags npx supabase db reset", () => {
    expect(requiresConfirmation("npx supabase db reset")).toBe(true);
  });

  it("flags DELETE FROM", () => {
    expect(requiresConfirmation("DELETE FROM memories WHERE id = 5")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(requiresConfirmation("GIT PUSH origin main")).toBe(true);
    expect(requiresConfirmation("drop table users")).toBe(true);
  });

  it("allows safe commands", () => {
    expect(requiresConfirmation("git status")).toBe(false);
    expect(requiresConfirmation("npm run build")).toBe(false);
    expect(requiresConfirmation("list all files in the project")).toBe(false);
    expect(requiresConfirmation("git log --oneline")).toBe(false);
  });

  it("detects dangerous patterns embedded in longer text", () => {
    expect(requiresConfirmation("please run git push origin main for me")).toBe(true);
    expect(requiresConfirmation("execute DELETE FROM users WHERE active = false")).toBe(true);
  });
});

describe("validateBudget", () => {
  it("accepts valid budgets", () => {
    expect(validateBudget(1)).toBe(true);
    expect(validateBudget(5)).toBe(true);
    expect(validateBudget(10)).toBe(true);
  });

  it("rejects zero", () => {
    expect(validateBudget(0)).toBe(false);
  });

  it("rejects negative values", () => {
    expect(validateBudget(-1)).toBe(false);
  });

  it("rejects above $10 cap", () => {
    expect(validateBudget(11)).toBe(false);
    expect(validateBudget(100)).toBe(false);
  });
});

describe("resolveProject", () => {
  it("resolves by name (case-insensitive)", () => {
    const project = resolveProject("jewelry-platform");
    expect(project).not.toBeNull();
    expect(project!.name).toBe("ЗҮҮСГЭЛ");
  });

  it("resolves by path prefix", () => {
    const path = process.env.BODHI_PROJECT_DIR || "/Users/macbookpro/Documents/jewelry-platform";
    const project = resolveProject(path + "/src/app");
    expect(project).not.toBeNull();
  });

  it("returns null for unknown project", () => {
    expect(resolveProject("nonexistent")).toBeNull();
    expect(resolveProject("/some/random/path")).toBeNull();
  });

  it("resolves custom projects added via addProject", () => {
    addProject("test-project", {
      name: "Test",
      path: "/tmp/test-project",
      allowedTools: ["Read"],
      maxBudgetUsd: 1,
    });
    const project = resolveProject("test-project");
    expect(project).not.toBeNull();
    expect(project!.name).toBe("Test");
  });
});
