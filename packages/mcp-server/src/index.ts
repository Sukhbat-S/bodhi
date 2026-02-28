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
  getMemoryStats,
  getRecentConversations,
  getTodaysContext,
  getBodhiStatus,
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
      .enum(["fact", "decision", "pattern", "preference", "event"])
      .optional()
      .default("fact")
      .describe("Memory type: fact, decision, pattern, preference, or event"),
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
