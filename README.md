# BODHI

**Personal AI companion with long-term memory.**

A TypeScript monorepo that turns a stateless LLM into a persistent, context-aware assistant -- one that remembers every conversation, tracks your projects, and gets smarter over time.

---

## What is BODHI

BODHI is a self-hosted AI companion that accumulates knowledge across sessions. It connects to Gmail, Calendar, GitHub, Vercel, Supabase, and Notion to build a complete picture of your work, then uses vector-based memory to recall relevant context in every conversation. Unlike disposable chat sessions, BODHI retains decisions, patterns, and preferences indefinitely.

## Features

- **Persistent memory** -- Voyage AI embeddings stored in pgvector. Facts, decisions, and patterns are extracted from every conversation and recalled by semantic similarity.
- **Context engine** -- 9 providers aggregate data from Gmail, Calendar, GitHub, Vercel, Supabase, and Notion. Every response is informed by your full digital context.
- **Proactive briefings** -- Morning, evening, and weekly summaries delivered via Telegram. Synthesized from memory, calendar, and inbox on a cron schedule.
- **Entity graph** -- Tracks people, projects, organizations, and topics linked across memories. Reveals hidden connections in your knowledge base.
- **Multi-channel** -- Telegram bot, web dashboard, and Claude Code MCP server. Same brain, every interface. Conversations persist across channels.
- **Self-improvement** -- Nightly synthesis deduplicates memories, detects cross-session patterns, decays stale data, and promotes frequently accessed knowledge.

## Architecture

```
Channels              Telegram  /  Web Dashboard  /  CLI (MCP)
                                  |
Application           Hono API  ---  Agent  ---  Scheduler
                                  |
Intelligence          Bridge (Claude)  ---  Memory Extractor  ---  Context Engine
                                  |
Data                  Supabase (pgvector)  ---  Voyage AI Embeddings  ---  Drizzle ORM
                                  |
Integrations          Gmail / Calendar / GitHub / Vercel / Supabase / Notion
```

All AI reasoning routes through Bridge, which calls the Claude Code CLI as a subprocess. The Agent uses an `AIBackend` interface; Bridge implements it.

## Tech Stack

| Layer | Tools |
|-------|-------|
| Language | TypeScript (ESM throughout) |
| Frontend | React 19, Vite 6, Tailwind CSS 3 |
| API | Hono |
| Database | Supabase Postgres, pgvector, Drizzle ORM |
| Embeddings | Voyage AI |
| AI Backend | Claude (via Claude Code CLI subprocess) |
| Messaging | Telegraf |
| Scheduling | node-cron |

## Quick Start

```bash
git clone https://github.com/Sukhbat-S/bodhi.git
cd bodhi
npm install
cp .env.example .env
```

Fill in the required API keys in `.env` (Supabase, Voyage AI, Telegram bot token, etc.), then:

```bash
npm run build
bash scripts/start.sh
```

The server starts on port 4000, serving both the API and dashboard.

For development with hot reload:

```bash
bash scripts/start.sh --dev
```

This runs the API on `:4000` and Vite dev server on `:5173`.

## Project Structure

```
packages/
  core/                Agent + ContextEngine (AIBackend interface)
  bridge/              Claude Code CLI subprocess
  db/                  Drizzle ORM + Supabase Postgres (pgvector)
  memory/              MemoryService + MemoryExtractor + MemoryContextProvider
  google/              Gmail + Calendar (shared OAuth2)
  knowledge/           Notion knowledge base context provider
  github/              GitHub activity tracking (commits, PRs, issues)
  vercel/              Vercel deployment tracking
  supabase-awareness/  Supabase project health monitoring
  mcp-server/          MCP server for Claude Code integration (8 tools)
  scheduler/           node-cron proactive briefings
  channels/
    telegram/          Telegraf bot (single-user, auth-gated)

apps/
  server/              Hono API (port 4000) + service wiring
  dashboard/           React 19 + Vite 6 + Tailwind 3 SPA
```

## By the Numbers

| | |
|---|---|
| Packages | 14+ |
| Stored memories | 1,600+ |
| Integrations | 9 |
| API endpoints | 25+ |
| Phases shipped | 16 |

## Built By

**Sukhbat Sosorbaram** -- 21, Ulaanbaatar, Mongolia.

[X / Twitter](https://x.com/SukhbatSosorba3) -- [GitHub](https://github.com/Sukhbat-S)

## License

MIT
