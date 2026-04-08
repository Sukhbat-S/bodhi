import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "./orchestrator.js";
import type { AIBackend, BridgeTask } from "@seneca/core";

function makeMockBackend(responses: Record<string, string>): AIBackend {
  let callIndex = 0;
  return {
    async execute(prompt, _options, onProgress) {
      const key = Object.keys(responses)[callIndex] || "default";
      const result = responses[key] || "done";
      callIndex++;
      onProgress?.({ type: "progress", content: "working..." });
      return {
        id: `task-${callIndex}`,
        prompt,
        cwd: "/tmp",
        allowedTools: [],
        maxTurns: 10,
        maxBudgetUsd: 0,
        status: "completed" as const,
        progress: ["working..."],
        result,
        startedAt: new Date(),
        completedAt: new Date(),
      };
    },
  };
}

describe("Orchestrator", () => {
  it("decomposes a goal into tasks and executes them", async () => {
    const planJson = JSON.stringify({
      goal: "test goal",
      estimatedHours: 0.1,
      phases: [{
        name: "Phase 1",
        tasks: [{
          id: "task-a",
          title: "Do thing A",
          prompt: "Do A",
          estimatedMinutes: 5,
          dependencies: [],
        }],
      }],
    });

    const backend = makeMockBackend({
      decompose: planJson,
      execute: "Task A done",
    });

    const orchestrator = new Orchestrator(backend, "/tmp/test-repo");
    const events: Array<{ type: string }> = [];

    const mission = await orchestrator.runMission(
      "test-mission-1",
      "test goal",
      "sonnet",
      (event) => events.push(event),
    );

    expect(mission.status).toBe("completed");
    expect(mission.tasks.length).toBe(1);
    expect(mission.tasks[0].title).toBe("Do thing A");
    expect(events.some((e) => e.type === "mission:planned")).toBe(true);
    expect(events.some((e) => e.type === "task:running")).toBe(true);
    expect(events.some((e) => e.type === "mission:completed")).toBe(true);
  });

  it("handles decomposition failure gracefully", async () => {
    const backend: AIBackend = {
      async execute() {
        return {
          id: "fail",
          prompt: "",
          cwd: "/tmp",
          allowedTools: [],
          maxTurns: 10,
          maxBudgetUsd: 0,
          status: "completed" as const,
          progress: [],
          result: "not json at all",
          startedAt: new Date(),
          completedAt: new Date(),
        };
      },
    };

    const orchestrator = new Orchestrator(backend, "/tmp/test-repo");
    const events: Array<{ type: string; error?: unknown }> = [];

    const mission = await orchestrator.runMission(
      "test-mission-2",
      "bad goal",
      "sonnet",
      (event) => events.push(event),
    );

    expect(mission.status).toBe("failed");
    expect(events.some((e) => e.type === "mission:failed")).toBe(true);
  });

  it("runs parallel tasks within a phase", async () => {
    const planJson = JSON.stringify({
      goal: "parallel test",
      estimatedHours: 0.1,
      phases: [{
        name: "Parallel Phase",
        tasks: [
          { id: "t1", title: "Task 1", prompt: "Do 1", estimatedMinutes: 1, dependencies: [] },
          { id: "t2", title: "Task 2", prompt: "Do 2", estimatedMinutes: 1, dependencies: [] },
          { id: "t3", title: "Task 3", prompt: "Do 3", estimatedMinutes: 1, dependencies: [] },
        ],
      }],
    });

    let concurrentCalls = 0;
    let maxConcurrent = 0;
    let isFirstCall = true;

    const backend: AIBackend = {
      async execute(prompt, _options, onProgress) {
        // First call is decomposition — return the plan
        if (isFirstCall) {
          isFirstCall = false;
          return {
            id: "decompose",
            prompt,
            cwd: "/tmp",
            allowedTools: [],
            maxTurns: 10,
            maxBudgetUsd: 0,
            status: "completed" as const,
            progress: [],
            result: planJson,
            startedAt: new Date(),
            completedAt: new Date(),
          };
        }

        // Subsequent calls are task executions
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise((r) => setTimeout(r, 50));
        concurrentCalls--;
        onProgress?.({ type: "progress", content: "done" });
        return {
          id: crypto.randomUUID(),
          prompt,
          cwd: "/tmp",
          allowedTools: [],
          maxTurns: 10,
          maxBudgetUsd: 0,
          status: "completed" as const,
          progress: ["done"],
          result: `Result for: ${prompt}`,
          startedAt: new Date(),
          completedAt: new Date(),
        };
      },
    };

    const orchestrator = new Orchestrator(backend, "/tmp/test-repo");
    const events: Array<{ type: string }> = [];

    const mission = await orchestrator.runMission(
      "test-mission-3",
      "parallel test",
      "sonnet",
      (event) => events.push(event),
    );

    expect(mission.status).toBe("completed");
    expect(mission.tasks.length).toBe(3);
    expect(mission.tasks.every((t) => t.status === "completed")).toBe(true);
    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
  });
});
