import type { WorkflowDefinition } from "@seneca/core";

export const morningResearch: WorkflowDefinition = {
  id: "morning-research",
  name: "Morning Research Workflow",
  description:
    "Multi-step morning briefing: gather context, analyze priorities, draft plan, generate briefing",
  steps: [
    {
      name: "gather",
      prompt:
        "Gather today's context. Summarize:\n" +
        "1. Calendar events for today and tomorrow\n" +
        "2. Unread emails (titles and senders, flag urgent ones)\n" +
        "3. Recent memories from the past 3 days (decisions, patterns, goals)\n" +
        "4. Any active goals and their current status\n\n" +
        "Be thorough but concise. This data feeds the next analysis step.",
    },
    {
      name: "analyze",
      prompt: (prev) =>
        `Given today's context:\n\n${prev[0].output}\n\n` +
        "Analyze:\n" +
        "1. What are the top 3 priorities today? Why?\n" +
        "2. Are there conflicts between meetings and deep work?\n" +
        "3. What patterns do you notice from recent days?\n" +
        "4. Are any goals stalling? What's the next action for each?\n" +
        "5. Is anything time-sensitive that needs immediate attention?",
    },
    {
      name: "draft-plan",
      prompt: (prev) =>
        `Based on the priorities:\n\n${prev[1].output}\n\n` +
        "Draft a concrete plan for today:\n" +
        "- What to tackle first (and why)\n" +
        "- What to defer\n" +
        "- One question to reflect on today\n" +
        "- One thing to be grateful for or excited about",
      model: "opus",
    },
    {
      name: "generate-briefing",
      prompt: (prev) =>
        "Compile everything into a morning briefing for Telegram.\n" +
        "Format: markdown, under 300 words, warm but direct tone.\n" +
        "Structure: Greeting -> Today's Focus -> Schedule -> Action Items -> Reflection Question\n\n" +
        `Raw context:\n${prev[0].output}\n\n` +
        `Analysis:\n${prev[1].output}\n\n` +
        `Plan:\n${prev[2].output}`,
    },
  ],
};
