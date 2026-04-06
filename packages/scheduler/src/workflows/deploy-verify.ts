import type { WorkflowDefinition } from "@seneca/core";

export const deployVerify: WorkflowDefinition = {
  id: "deploy-verify",
  name: "Deploy & Verify Workflow",
  description: "Build all packages, restart server, verify health",
  steps: [
    {
      name: "build",
      prompt:
        "Run `npm run build` in the BODHI project root. Report:\n" +
        "1. Which packages built successfully\n" +
        "2. Any errors or warnings\n" +
        "3. Total build time\n\n" +
        "If build fails, report the exact error and which package failed.",
    },
    {
      name: "health-check",
      prompt: (prev) => {
        const buildOutput = prev[0].output;
        if (
          buildOutput.toLowerCase().includes("error") &&
          !buildOutput.toLowerCase().includes("0 errors")
        ) {
          return (
            "The build had errors:\n\n" +
            buildOutput +
            "\n\nDo NOT proceed with deployment. " +
            "Summarize what failed and what needs to be fixed."
          );
        }
        return (
          "Build succeeded. Now verify the server is healthy:\n" +
          "1. Check `curl -s http://localhost:4000/api/status`\n" +
          "2. Verify all services are online\n" +
          "3. Check memory service connectivity\n" +
          "4. Report any issues"
        );
      },
      shouldRun: (prev) => {
        // Skip health check if build failed
        const buildOutput = prev[0]?.output?.toLowerCase() ?? "";
        return !(
          buildOutput.includes("error") &&
          !buildOutput.includes("0 errors")
        );
      },
    },
    {
      name: "notify",
      prompt: (prev) =>
        "Generate a short deployment summary for Telegram notification:\n" +
        "- Build result\n" +
        "- Health check result\n" +
        "- Any action items\n\n" +
        `Build:\n${prev[0].output}\n\n` +
        `Health:\n${prev[1]?.skipped ? "Skipped (build failed)" : prev[1]?.output ?? "N/A"}`,
    },
  ],
};
