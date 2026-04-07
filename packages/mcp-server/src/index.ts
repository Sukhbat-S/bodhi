#!/usr/bin/env node
// ============================================================
// BODHI MCP Server — Bridge 2: BODHI's brain → Claude Code
//
// Exposes BODHI's personal knowledge (memories, conversations,
// calendar, email) to Claude Code via the Model Context Protocol.
//
// Transport: stdio (spawned by Claude Code as a subprocess)
// Backend:   Calls BODHI's REST API at localhost:4000
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  searchMemories,
  storeMemory,
  storeSessionSummary,
  getProjectContext,
  getMemoryStats,
  getRecentConversations,
  getTodaysContext,
  getBodhiStatus,
  getBriefing,
  runMemorySynthesis,
  getInsights,
  extractMemories,
  generateBuildLog,
  generateWeeklyDigest,
  getWorkflows,
  triggerWorkflow,
  registerActiveSession,
  deregisterActiveSession,
  getActiveSessions,
  sendSessionMessage,
  getSessionMessages,
  checkFileConflicts,
} from "./client.js";

// Create MCP server
const server = new McpServer({
  name: "bodhi",
  version: "0.1.0",
});

// --------------------------------------------------
// Tool: search_memories
// --------------------------------------------------
server.tool(
  "search_memories",
  "Search BODHI's memory using semantic vector search. Use this to find what Sukhbat discussed, decided, or learned in past conversations. Returns memories ranked by relevance.",
  {
    query: z.string().describe("What to search for (e.g., 'checkout flow decisions', 'deployment patterns')"),
    limit: z.number().optional().default(10).describe("Max results to return (default: 10)"),
  },
  async ({ query, limit }) => {
    const result = await searchMemories(query, limit);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: store_memory
// --------------------------------------------------
server.tool(
  "store_memory",
  "Store a new memory in BODHI's long-term memory. Use this to save important decisions, patterns, or facts discovered during this session so BODHI remembers them.",
  {
    content: z.string().describe("The memory to store (be specific and self-contained)"),
    type: z
      .enum(["fact", "decision", "pattern", "preference", "event", "goal"])
      .optional()
      .default("fact")
      .describe("Memory type: fact, decision, pattern, preference, event, or goal"),
    importance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.7)
      .describe("Importance score 0-1 (default: 0.7)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorization (e.g., ['jewelry', 'auth', 'bug-fix'])"),
  },
  async ({ content, type, importance, tags }) => {
    const result = await storeMemory({ content, type, importance, tags });
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: store_session_summary
// --------------------------------------------------
server.tool(
  "store_session_summary",
  "Store a complete session summary with multiple memories in one batch. More efficient than calling store_memory multiple times. Use at session end via /session-save.",
  {
    project: z.string().describe("Project name (e.g., 'bodhi', 'jewelry')"),
    completed: z
      .array(z.string())
      .describe("List of completed items this session"),
    pending: z
      .array(z.string())
      .describe("List of pending/blocked items for next session"),
    memories: z
      .array(
        z.object({
          content: z.string().describe("The memory content (self-contained)"),
          type: z
            .enum(["fact", "decision", "pattern", "preference", "event"])
            .describe("Memory type"),
          importance: z
            .number()
            .min(0)
            .max(1)
            .describe("Importance 0-1"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Tags (project tag added automatically)"),
        }),
      )
      .describe("Extracted memories to store"),
    sessionNote: z
      .string()
      .optional()
      .describe("Optional free-form session note"),
  },
  async ({ project, completed, pending, memories, sessionNote }) => {
    const result = await storeSessionSummary({
      project,
      completed,
      pending,
      memories,
      sessionNote,
    });
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_project_context
// --------------------------------------------------
server.tool(
  "get_project_context",
  "Get all BODHI memories tagged with a specific project. Returns memories grouped by type (facts, decisions, patterns, etc). Useful at session start for loading project context.",
  {
    project: z.string().describe("Project name tag (e.g., 'bodhi', 'jewelry')"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Max memories to return (default: 20)"),
  },
  async ({ project, limit }) => {
    const result = await getProjectContext(project, limit);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_recent_conversations
// --------------------------------------------------
server.tool(
  "get_recent_conversations",
  "Get Sukhbat's recent conversations with BODHI. Shows what he's been discussing, his priorities, questions, and plans. Useful at session start for context.",
  {
    limit: z.number().optional().default(5).describe("Number of recent threads to fetch (default: 5)"),
  },
  async ({ limit }) => {
    const result = await getRecentConversations(limit);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_todays_context
// --------------------------------------------------
server.tool(
  "get_todays_context",
  "Get Sukhbat's context for today: calendar events, unread emails, and BODHI system status. Quick situational awareness.",
  {},
  async () => {
    const result = await getTodaysContext();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_memory_stats
// --------------------------------------------------
server.tool(
  "get_memory_stats",
  "Get statistics about BODHI's memory: total memories, top tags, and recent activity.",
  {},
  async () => {
    const result = await getMemoryStats();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_bodhi_status
// --------------------------------------------------
server.tool(
  "get_bodhi_status",
  "Check if BODHI is online and what services are running (memory, Gmail, Calendar, Notion, Telegram, etc.).",
  {},
  async () => {
    const result = await getBodhiStatus();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_briefing
// --------------------------------------------------
server.tool(
  "get_briefing",
  "Generate a briefing (morning, evening, or weekly). Morning: calendar + inbox + recent memories + insights. Evening: day recap + observations. Weekly: patterns + attention items + stalled decisions.",
  {
    type: z
      .enum(["morning", "evening", "weekly"])
      .describe("Briefing type: 'morning' (daily kickoff), 'evening' (day reflection), 'weekly' (Sunday synthesis)"),
  },
  async ({ type }) => {
    const result = await getBriefing(type);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: run_memory_synthesis
// --------------------------------------------------
server.tool(
  "run_memory_synthesis",
  "Run BODHI's memory synthesis cycle: deduplicates near-identical memories, clusters related memories into patterns, decays stale low-value memories, and promotes frequently-accessed ones. Usually runs at 03:00 daily but can be triggered manually.",
  {},
  async () => {
    const result = await runMemorySynthesis();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_insights
// --------------------------------------------------
server.tool(
  "get_insights",
  "Get analytical insights from BODHI's memory: tag trends, stalled decisions, neglected high-value memories, and activity rates. Useful for understanding what Sukhbat has been focusing on and what needs attention.",
  {},
  async () => {
    const result = await getInsights();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: extract_memories
// --------------------------------------------------
server.tool(
  "extract_memories",
  "Extract memorable facts, decisions, and patterns from a conversation exchange. Pass the user message and assistant response — BODHI will identify and store important information automatically.",
  {
    user_message: z.string().describe("The user's message from the conversation"),
    assistant_response: z.string().describe("The assistant's response from the conversation"),
  },
  async ({ user_message, assistant_response }) => {
    const result = await extractMemories(user_message, assistant_response);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: generate_build_log
// --------------------------------------------------
server.tool(
  "generate_build_log",
  "Generate a build-in-public post from recent git commits and session memories. Returns tweet-ready content for X/Twitter. Use this to create content about what was built recently.",
  {
    days: z.number().optional().default(7).describe("Number of days to look back (default: 7)"),
    topic: z.string().optional().default("").describe("Optional topic focus (e.g., 'dashboard improvements')"),
  },
  async ({ days, topic }) => {
    const result = await generateBuildLog(days, topic);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: generate_weekly_digest
// --------------------------------------------------
server.tool(
  "generate_weekly_digest",
  "Generate a weekly work digest summarizing commits, memories, and progress. Returns a digest paragraph and tweet-ready summaries.",
  {},
  async () => {
    const result = await generateWeeklyDigest();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_workflows
// --------------------------------------------------
server.tool(
  "get_workflows",
  "List available BODHI workflows — multi-step agent pipelines for morning research, deployment verification, and weekly synthesis.",
  {},
  async () => {
    const result = await getWorkflows();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: trigger_workflow
// --------------------------------------------------
server.tool(
  "trigger_workflow",
  "Trigger a BODHI workflow by ID. Runs a multi-step agent pipeline (e.g., morning-research, deploy-verify, weekly-synthesis). Each step passes its output as context to the next.",
  {
    workflow_id: z.string().describe("Workflow ID (e.g., 'morning-research', 'deploy-verify', 'weekly-synthesis')"),
  },
  async ({ workflow_id }) => {
    const result = await triggerWorkflow(workflow_id);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: register_active_session
// --------------------------------------------------
server.tool(
  "register_active_session",
  "Register an active Claude Code session with BODHI so the dashboard shows what you're currently working on. Call this at the start of each session.",
  {
    project: z.string().describe("Project name (e.g., 'bodhi', 'jewelry-platform')"),
    description: z.string().describe("What you're working on (e.g., 'Dashboard home page redesign')"),
    id: z.string().optional().describe("Optional session ID (auto-generated if omitted)"),
  },
  async ({ project, description, id }) => {
    const result = await registerActiveSession(project, description, id);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: deregister_active_session
// --------------------------------------------------
server.tool(
  "deregister_active_session",
  "Deregister an active session when done. Call this during /session-save.",
  {
    id: z.string().describe("Session ID to deregister"),
  },
  async ({ id }) => {
    const result = await deregisterActiveSession(id);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_active_sessions
// --------------------------------------------------
server.tool(
  "get_active_sessions",
  "List all currently active Claude Code sessions across all terminals/tabs.",
  {},
  async () => {
    const result = await getActiveSessions();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: send_session_message
// --------------------------------------------------
server.tool(
  "send_session_message",
  "Send a message to other Claude Code sessions via BODHI. Use to coordinate: warn about file conflicts, share decisions, or broadcast status updates. Messages expire after 1 hour.",
  {
    from: z.string().describe("Your session ID (e.g., 'bodhi-main')"),
    message: z.string().describe("Message content (e.g., 'Refactoring TryOnModal — don't edit it')"),
    to: z.string().optional().describe("Target session ID. Omit to broadcast to all sessions."),
  },
  async ({ from, message, to }) => {
    const result = await sendSessionMessage(from, message, to);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: get_session_messages
// --------------------------------------------------
server.tool(
  "get_session_messages",
  "Read messages from other Claude Code sessions. Check this at session start and periodically to stay coordinated.",
  {
    session_id: z.string().optional().describe("Your session ID to filter messages addressed to you"),
    since: z.string().optional().describe("ISO timestamp — only get messages after this time"),
  },
  async ({ session_id, since }) => {
    const result = await getSessionMessages(session_id, since);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Tool: check_file_conflicts
// --------------------------------------------------
server.tool(
  "check_file_conflicts",
  "See which files are being edited by other Claude Code sessions right now. Check before editing shared files to avoid conflicts.",
  {},
  async () => {
    const result = await checkFileConflicts();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --------------------------------------------------
// Start server
// --------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error("[bodhi-mcp] Server started (stdio transport)");
}

main().catch((error) => {
  console.error("[bodhi-mcp] Fatal error:", error);
  process.exit(1);
});
