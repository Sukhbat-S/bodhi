# BODHI

> Personal AI companion with long-term memory, proactive intelligence, and multi-channel delivery. Built on Claude.

BODHI is an open-source framework for building a personal AI that actually knows you. It remembers past conversations, learns your patterns, connects to your tools (Gmail, Calendar, GitHub, Notion), and proactively surfaces insights via Telegram briefings.

Unlike chatbot wrappers, BODHI has **persistent semantic memory** (Voyage AI embeddings + pgvector), **cross-session reasoning** (detects recurring themes across days), and a **proactive scheduler** that sends morning briefings, evening reflections, and weekly syntheses without being asked.

## Architecture

TypeScript monorepo with 14 packages. All AI reasoning routes through Claude Code CLI via the Bridge pattern — $0 per message with a Max subscription.

```
packages/
  core/              — Agent + ContextEngine (AIBackend interface)
  bridge/            — Claude Code CLI subprocess (the AI backbone)
  db/                — Drizzle ORM + Supabase Postgres (pgvector)
  memory/            — MemoryService + Extractor + Synthesizer + Insights
  google/            — Gmail + Calendar (OAuth2, read-only)
  knowledge/         — Multi-project knowledge context provider
  github/            — GitHub activity tracking (commits, PRs, issues)
  vercel/            — Vercel deployment monitoring
  supabase-awareness/— Supabase project health monitoring
  mcp-server/        — MCP server for Claude Code integration (12 tools)
  scheduler/         — Cron-based proactive briefings via Telegram
  channels/telegram/ — Telegraf bot (single-user, allowedUserId gated)
apps/
  server/            — Hono API (port 4000) + all service wiring
  dashboard/         — React 19 + Vite 6 + Tailwind 3 SPA
```

## Features

- **Persistent Memory** — Stores facts, decisions, patterns, and events with semantic embeddings. Retrieves by meaning, not keywords.
- **Cross-Session Reasoning** — Detects recurring themes across conversations. Auto-generates pattern memories when a topic appears 3+ times across different days.
- **Memory Synthesis** — Daily automated cycle: deduplicates near-identical memories, clusters related ones, decays stale entries, promotes frequently-accessed ones.
- **Proactive Briefings** — Morning (calendar + inbox + patterns), evening (day recap + reflection), weekly (trends + attention items). Delivered via Telegram.
- **Multi-Channel** — Chat via Telegram, web dashboard, or REST API. All channels share the same memory and context.
- **Context Engine** — Priority-weighted context providers (memory, projects, Notion, Gmail, Calendar, GitHub, Vercel, Supabase) with keyword-based relevance.
- **MCP Server** — 12 tools exposed to Claude Code for searching memories, storing knowledge, triggering briefings, and more.
- **Dashboard** — Full SPA with chat, memory explorer, Gmail inbox, calendar, conversation history, and memory quality management.
- **Autonomous Health Monitoring** — Heartbeat script runs via cron, checks all services, alerts via Telegram only when issues are found.

## Quick Start

### Prerequisites

- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Supabase project with pgvector extension enabled
- Telegram bot token (via [@BotFather](https://t.me/BotFather))
- Voyage AI API key (for embeddings)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/bodhi.git
cd bodhi
cp .env.example .env           # Fill in your values
npm install                     # Install all workspace dependencies
npm run build                   # Build all 14 packages
bash scripts/start.sh           # Start server on :4000
```

### Development

```bash
bash scripts/start.sh --dev     # API on :4000 + Vite HMR on :5173
```

The server uses `tsx watch` for auto-reload on TypeScript changes.

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access |
| `BODHI_OWNER_NAME` | Yes | Your name (used in prompts) |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_ALLOWED_USER_ID` | Yes | Your Telegram user ID |
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string |
| `VOYAGE_API_KEY` | Yes | Voyage AI embeddings |
| `GOOGLE_CLIENT_ID` | No | Gmail + Calendar integration |
| `NOTION_API_KEY` | No | Notion workspace knowledge |
| `GITHUB_TOKEN` | No | GitHub activity tracking |
| `VERCEL_TOKEN` | No | Deployment monitoring |
| `SUPABASE_ACCESS_TOKEN` | No | Supabase health monitoring |
| `GROQ_API_KEY` | No | Voice message transcription |

See `.env.example` for the complete list with descriptions.

## How It Works

### Bridge Pattern

All AI reasoning goes through the Bridge — a subprocess wrapper around Claude Code CLI. This means:
- $0 per message with a Claude Max subscription
- Full tool access (Read, Edit, Bash, Grep, Glob, Write)
- No API rate limits or token counting needed

### Memory System

```
User message → MemoryExtractor → Claude (extract facts) → Store with embeddings
                                                              ↓
Query → Voyage AI embedding → pgvector similarity search → Ranked results
                                                              ↓
Daily synthesis → Dedup + Cluster + Decay + Promote → Clean, connected memory
```

### Context Engine

When you send a message, the Context Engine gathers relevant context from all providers:
1. **Memory** (priority 10) — Semantically similar memories
2. **Projects** (priority 9) — CLAUDE.md and MEMORY.md from registered projects
3. **Notion** (priority 8) — Workspace tasks and sessions
4. **Gmail/Calendar** (priority 7) — Recent emails and today's events
5. **GitHub/Vercel/Supabase** (priority 6) — Development activity

## Deployment

BODHI can run 24/7 on a VPS via Docker:

```bash
docker compose build && docker compose up -d
curl localhost:4000/health
```

Transfer Claude Code auth to VPS:
```bash
scp ~/.config/claude-code/auth.json user@vps:~/.config/claude-code/auth.json
```

See `REFERENCE.md` for full API endpoint documentation and deployment details.

## Project Structure

| Package | Purpose |
|---------|---------|
| `@seneca/core` | Agent + ContextEngine + type definitions |
| `@seneca/bridge` | Claude Code CLI subprocess wrapper |
| `@seneca/db` | Drizzle ORM schema + migrations |
| `@seneca/memory` | Memory storage, retrieval, extraction, synthesis |
| `@seneca/google` | Gmail + Calendar OAuth2 integration |
| `@seneca/knowledge` | Multi-project knowledge context |
| `@seneca/github` | GitHub activity tracking |
| `@seneca/vercel` | Vercel deployment monitoring |
| `@seneca/supabase-awareness` | Supabase health monitoring |
| `@seneca/mcp-server` | MCP server (12 tools for Claude Code) |
| `@seneca/scheduler` | Cron-based proactive briefings |
| `@seneca/telegram` | Telegraf bot with conversation persistence |

## License

[MIT](LICENSE)
