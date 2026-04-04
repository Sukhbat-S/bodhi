import { describe, it, expect, vi, beforeEach } from "vitest";
import { Scheduler, type SchedulerConfig } from "./scheduler.js";

function makeConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    agent: {
      chat: vi.fn().mockResolvedValue({ content: "Briefing content here" }),
      stream: vi.fn(),
      config: {} as any,
    } as any,
    telegram: {
      sendProactiveMessage: vi.fn().mockResolvedValue(undefined),
    },
    memoryService: {
      getStats: vi.fn().mockResolvedValue({
        totalMemories: 100,
        recentCount: 5,
        topTags: [{ tag: "bodhi", count: 10 }],
      }),
      list: vi.fn().mockResolvedValue([
        {
          id: "1",
          type: "fact",
          content: "Test memory",
          tags: ["test"],
          createdAt: new Date(),
        },
      ]),
    } as any,
    contextEngine: {
      gather: vi.fn().mockResolvedValue({
        fragments: [],
        totalTokens: 0,
        timestamp: new Date(),
      }),
    } as any,
    timezone: "Asia/Ulaanbaatar",
    ...overrides,
  };
}

describe("Scheduler", () => {
  describe("getStatus", () => {
    it("returns running=false before start", () => {
      const scheduler = new Scheduler(makeConfig());
      const status = scheduler.getStatus();
      expect(status.running).toBe(false);
    });

    it("returns all 4 job types", () => {
      const scheduler = new Scheduler(makeConfig());
      const status = scheduler.getStatus();
      const types = status.jobs.map((j) => j.type);
      expect(types).toContain("morning");
      expect(types).toContain("evening");
      expect(types).toContain("weekly");
      expect(types).toContain("synthesis");
    });

    it("has null lastRun initially for all jobs", () => {
      const scheduler = new Scheduler(makeConfig());
      const status = scheduler.getStatus();
      for (const job of status.jobs) {
        expect(job.lastRun).toBeNull();
        expect(job.lastResult).toBeNull();
      }
    });

    it("returns configured timezone", () => {
      const scheduler = new Scheduler(makeConfig());
      expect(scheduler.getStatus().timezone).toBe("Asia/Ulaanbaatar");
    });
  });

  describe("trigger synthesis", () => {
    it("returns skipped when no synthesizer configured", async () => {
      const scheduler = new Scheduler(makeConfig({ synthesizer: undefined }));
      const result = await scheduler.trigger("synthesis");
      expect(result.status).toBe("skipped");
      expect(result.error).toContain("No synthesizer");
    });

    it("calls synthesizer.run() and returns report", async () => {
      const synthesizer = {
        run: vi.fn().mockResolvedValue({
          deduped: 2,
          connected: 1,
          decayed: 3,
          promoted: 0,
        }),
      };
      const scheduler = new Scheduler(makeConfig({ synthesizer } as any));
      const result = await scheduler.trigger("synthesis");

      expect(synthesizer.run).toHaveBeenCalled();
      expect(result.status).toBe("sent");
      expect(result.content).toContain("2 deduped");
      expect(result.content).toContain("1 connected");
    });

    it("records job state on success", async () => {
      const synthesizer = {
        run: vi.fn().mockResolvedValue({ deduped: 0, connected: 0, decayed: 0, promoted: 0 }),
      };
      const scheduler = new Scheduler(makeConfig({ synthesizer } as any));
      await scheduler.trigger("synthesis");

      const job = scheduler.getStatus().jobs.find((j) => j.type === "synthesis")!;
      expect(job.lastRun).not.toBeNull();
      expect(job.lastResult).toBe("sent");
      expect(job.lastDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("records error on synthesizer failure", async () => {
      const synthesizer = {
        run: vi.fn().mockRejectedValue(new Error("DB connection lost")),
      };
      const scheduler = new Scheduler(makeConfig({ synthesizer } as any));
      const result = await scheduler.trigger("synthesis");

      expect(result.status).toBe("error");
      expect(result.error).toContain("DB connection lost");

      const job = scheduler.getStatus().jobs.find((j) => j.type === "synthesis")!;
      expect(job.lastResult).toBe("error");
    });
  });

  describe("trigger briefing", () => {
    it("skips when totalMemories is 0", async () => {
      const config = makeConfig();
      (config.memoryService.getStats as any).mockResolvedValue({
        totalMemories: 0,
        recentCount: 0,
        topTags: [],
      });
      const scheduler = new Scheduler(config);
      const result = await scheduler.trigger("morning");

      expect(result.status).toBe("skipped");
    });

    it("skips morning when recentCount is 0", async () => {
      const config = makeConfig();
      (config.memoryService.getStats as any).mockResolvedValue({
        totalMemories: 100,
        recentCount: 0,
        topTags: [],
      });
      const scheduler = new Scheduler(config);
      const result = await scheduler.trigger("morning");

      expect(result.status).toBe("skipped");
    });

    it("skips evening when recentCount is 0", async () => {
      const config = makeConfig();
      (config.memoryService.getStats as any).mockResolvedValue({
        totalMemories: 100,
        recentCount: 0,
        topTags: [],
      });
      const scheduler = new Scheduler(config);
      const result = await scheduler.trigger("evening");

      expect(result.status).toBe("skipped");
    });

    it("does NOT skip weekly even when recentCount is 0", async () => {
      const config = makeConfig();
      (config.memoryService.getStats as any).mockResolvedValue({
        totalMemories: 100,
        recentCount: 0,
        topTags: [{ tag: "bodhi", count: 5 }],
      });
      const scheduler = new Scheduler(config);
      const result = await scheduler.trigger("weekly");

      expect(result.status).toBe("sent");
      expect(config.agent.chat).toHaveBeenCalled();
    });

    it("generates briefing and sends to Telegram", async () => {
      const config = makeConfig();
      const scheduler = new Scheduler(config);
      const result = await scheduler.trigger("morning");

      expect(result.status).toBe("sent");
      expect(result.content).toBe("Briefing content here");
      expect(config.agent.chat).toHaveBeenCalled();
      expect(config.telegram.sendProactiveMessage).toHaveBeenCalledWith(
        expect.stringContaining("Morning Briefing")
      );
    });

    it("includes Gmail data when gmail source is configured", async () => {
      const gmail = {
        getBriefingSummary: vi.fn().mockResolvedValue("3 unread emails"),
        getRecent: vi.fn().mockResolvedValue([]),
      };
      const config = makeConfig({ gmail });
      const scheduler = new Scheduler(config);
      await scheduler.trigger("morning");

      expect(gmail.getBriefingSummary).toHaveBeenCalled();
      // The prompt passed to agent.chat should include gmail data
      const chatCall = (config.agent.chat as any).mock.calls[0][0] as string;
      expect(chatCall).toContain("Gmail Inbox");
      expect(chatCall).toContain("3 unread emails");
    });

    it("includes Calendar data when calendar source is configured", async () => {
      const calendar = {
        getBriefingSummary: vi.fn().mockResolvedValue("2 meetings today"),
      };
      const config = makeConfig({ calendar });
      const scheduler = new Scheduler(config);
      await scheduler.trigger("morning");

      expect(calendar.getBriefingSummary).toHaveBeenCalledWith("morning");
      const chatCall = (config.agent.chat as any).mock.calls[0][0] as string;
      expect(chatCall).toContain("Google Calendar");
      expect(chatCall).toContain("2 meetings today");
    });

    it("records job duration on success", async () => {
      const scheduler = new Scheduler(makeConfig());
      await scheduler.trigger("morning");

      const job = scheduler.getStatus().jobs.find((j) => j.type === "morning")!;
      expect(job.lastRun).not.toBeNull();
      expect(job.lastResult).toBe("sent");
      expect(job.lastDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("records error on agent failure", async () => {
      const config = makeConfig();
      (config.agent.chat as any).mockRejectedValue(new Error("Bridge timeout"));
      const scheduler = new Scheduler(config);
      const result = await scheduler.trigger("morning");

      expect(result.status).toBe("error");
      expect(result.error).toContain("Bridge timeout");
    });
  });
});
