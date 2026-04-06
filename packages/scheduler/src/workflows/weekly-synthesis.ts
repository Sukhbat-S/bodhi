import type { WorkflowDefinition } from "@seneca/core";

export const weeklySynthesis: WorkflowDefinition = {
  id: "weekly-synthesis",
  name: "Weekly Synthesis Workflow",
  description:
    "Gather 7 days of data, detect patterns, generate weekly digest",
  steps: [
    {
      name: "gather-week",
      prompt:
        "Gather the past 7 days of activity:\n" +
        "1. All memories created this week (grouped by type)\n" +
        "2. Git commits and PRs (if available)\n" +
        "3. Key decisions made\n" +
        "4. Goal progress updates\n" +
        "5. Entity interactions (who/what was discussed most)\n\n" +
        "Be comprehensive — this feeds the pattern analysis.",
    },
    {
      name: "pattern-analysis",
      model: "opus",
      prompt: (prev) =>
        `Here is the week's activity data:\n\n${prev[0].output}\n\n` +
        "Analyze for deeper patterns:\n" +
        "1. What themes recurred across the week?\n" +
        "2. What got started but not finished?\n" +
        "3. What energy patterns do you notice? (productive days vs scattered days)\n" +
        "4. Are there decisions that contradict each other?\n" +
        "5. What's the trajectory — is momentum building or diffusing?\n" +
        "6. One honest observation the user might not want to hear but needs to",
    },
    {
      name: "generate-digest",
      prompt: (prev) =>
        "Write a weekly reflection briefing for Telegram.\n" +
        "Format: markdown, 400-500 words, reflective and honest tone.\n" +
        "Structure:\n" +
        "- Week in Review (highlights)\n" +
        "- Patterns Noticed\n" +
        "- Wins (what went well)\n" +
        "- Watch (what needs attention)\n" +
        "- Next Week Focus (1-2 priorities)\n\n" +
        `Activity:\n${prev[0].output}\n\n` +
        `Analysis:\n${prev[1].output}`,
    },
  ],
};
