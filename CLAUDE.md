# BODHI — Project Intelligence File

> Personal AI companion for Sukhbat. Built as a TypeScript monorepo.

## Quick Start

```bash
cd ~/Documents/bodhi
npm run dev -w @seneca/server     # API on :4000
npm run dev -w @seneca/dashboard  # Dashboard on :5173
```

## Architecture

Monorepo with npm workspaces. 8 packages, all TypeScript ESM.

```
packages/
  core/         — Agent + ContextEngine (AIBackend interface)
  bridge/       — Claude Code CLI subprocess ($0 via Max subscription)
  db/           — Drizzle ORM + Supabase Postgres (pgvector)
  memory/       — MemoryService + MemoryExtractor + MemoryContextProvider
  scheduler/    — node-cron proactive briefings (morning/evening/weekly)
  channels/
    telegram/   — Telegraf bot (single-user, allowedUserId gated)
apps/
  server/       — Hono API (port 4000) + all service wiring
  dashboard/    — React 19 + Vite 6 + Tailwind 3 SPA (port 5173)
```

## Key Patterns

- **ALL AI reasoning** routes through Bridge → Claude Code CLI (not Anthropic API)
- Agent uses `AIBackend` interface, Bridge implements it
- Memory uses Voyage AI for embeddings, pgvector for similarity search
- Telegram bot: single-user only, `allowedUserId` from env
- Dashboard proxies `/api/*` to `:4000` via Vite config
- Scheduler: non-blocking start (Telegraf `launch()` never resolves)
- `app.onError()` global handler returns JSON errors, never HTML

## Environment Variables (.env at monorepo root)

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
DATABASE_URL=postgresql://...
VOYAGE_API_KEY=
PORT=4000
```

`ANTHROPIC_API_KEY` is optional (not used — Bridge handles AI).

## API Endpoints (Hono on :4000)

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Health check |
| `/api/status` | GET | Service status |
| `/api/chat` | POST | Chat (non-streaming) |
| `/api/chat/stream` | POST | SSE streaming chat |
| `/api/code` | POST | Bridge direct execution |
| `/api/memories` | GET | List memories (paginated, filterable) |
| `/api/memories` | POST | Create memory |
| `/api/memories/stats` | GET | Memory statistics |
| `/api/memories/search` | GET | Semantic vector search |
| `/api/memories/:id` | DELETE | Delete memory |
| `/api/scheduler` | GET | Scheduler status + job history |
| `/api/scheduler/trigger` | POST | Manual briefing trigger |

## Known Issues

- **Supabase DNS**: `db.fhklghhdqsotgyptdlhr.supabase.co` not resolving.
  Pooler also returns "Tenant not found". Need new Supabase project.
  Server/dashboard handle this gracefully (JSON errors, partial rendering).
- **Telegraf `launch()`**: Never resolves during long-polling. Scheduler and
  all other services start independently (non-blocking telegram start).

## Build

```bash
npm run build          # builds all 8 packages
npm run build -w @seneca/scheduler  # build single package
```

## Phases

1. Bridge — Claude Code CLI subprocess ✅
2. Memory — Voyage embeddings + pgvector + Drizzle ✅
3. Dashboard — React SPA (Status, Memories, Chat) ✅
4. Scheduler — Proactive briefings via cron → Telegram ✅
