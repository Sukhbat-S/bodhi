# BODHI — Project Intelligence File

> Personal AI companion for Sukhbat. Built as a TypeScript monorepo.

## Quick Start

```bash
cd ~/Documents/bodhi
npm run dev -w @seneca/server     # API on :4000
npm run dev -w @seneca/dashboard  # Dashboard on :5173
```

## Architecture

Monorepo with npm workspaces. 9 packages, all TypeScript ESM.

```
packages/
  core/         — Agent + ContextEngine (AIBackend interface)
  bridge/       — Claude Code CLI subprocess ($0 via Max subscription)
  db/           — Drizzle ORM + Supabase Postgres (pgvector)
  memory/       — MemoryService + MemoryExtractor + MemoryContextProvider
  google/       — Gmail + Calendar (shared OAuth2, read-only)
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
GOOGLE_CLIENT_ID=        # optional — enables Gmail + Calendar
GOOGLE_CLIENT_SECRET=    # optional
GOOGLE_REDIRECT_URI=     # optional (defaults to localhost:4000 callback)
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
| `/api/google/auth` | GET | Get Google OAuth consent URL |
| `/api/google/oauth/callback` | GET | OAuth callback handler |
| `/api/gmail/status` | GET | Gmail connection status |
| `/api/gmail/inbox` | GET | Recent inbox emails |
| `/api/gmail/unread` | GET | Unread count |
| `/api/gmail/search` | GET | Search emails (q param) |
| `/api/calendar/status` | GET | Calendar connection status |
| `/api/calendar/today` | GET | Today's events |
| `/api/calendar/upcoming` | GET | Next N days events |
| `/api/calendar/free` | GET | Free time slots today |

## Known Issues

- **Telegraf `launch()`**: Never resolves during long-polling. Scheduler and
  all other services start independently (non-blocking telegram start).

## Build

```bash
npm run build          # builds all 9 packages
npm run build -w @seneca/scheduler  # build single package
```

## Phases

1. Bridge — Claude Code CLI subprocess ✅
2. Memory — Voyage embeddings + pgvector + Drizzle ✅
3. Dashboard — React SPA (Status, Memories, Chat) ✅
4. Scheduler — Proactive briefings via cron → Telegram ✅
5. Notion — Workspace tasks & sessions context ✅
6. Google — Gmail + Calendar (OAuth2, read-only) ✅
