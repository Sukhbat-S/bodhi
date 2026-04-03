# BODHI — Project Intelligence File

> Personal AI companion framework. Built as a TypeScript monorepo.

## Quick Start

```bash
cd ~/Documents/bodhi
bash scripts/start.sh            # Single server: API + Dashboard on :4000
bash scripts/start.sh --dev      # Dev mode: API on :4000 + Vite HMR on :5173
```

Auto-start on terminal open: `source ~/Documents/bodhi/scripts/bodhi-autostart.sh` in `.zshrc`

## Architecture

Monorepo with npm workspaces. 14 packages, all TypeScript ESM.

```
packages/
  core/                — Agent + ContextEngine (AIBackend interface)
  bridge/              — Claude Code CLI subprocess ($0 via Max subscription)
  db/                  — Drizzle ORM + Supabase Postgres (pgvector)
  memory/              — MemoryService + MemoryExtractor + MemoryContextProvider
  google/              — Gmail + Calendar (shared OAuth2, read-only)
  knowledge/           — Notion knowledge base context provider
  github/              — GitHub activity tracking (commits, PRs, issues)
  vercel/              — Vercel deployment tracking
  supabase-awareness/  — Supabase project health monitoring
  mcp-server/          — MCP server for Claude Code integration (8 tools)
  scheduler/           — node-cron proactive briefings (morning/evening/weekly)
  channels/
    telegram/          — Telegraf bot (single-user, allowedUserId gated)
apps/
  server/              — Hono API (port 4000) + all service wiring
  dashboard/           — React 19 + Vite 6 + Tailwind 3 SPA (port 5173)
```

## Key Patterns

- **ALL AI reasoning** routes through Bridge → Claude Code CLI (not Anthropic API)
- Agent uses `AIBackend` interface, Bridge implements it
- Memory uses Voyage AI for embeddings, pgvector for similarity search
- Telegram bot: single-user only, `allowedUserId` from env
- Dashboard proxies `/api/*` to `:4000` via Vite config
- Scheduler: non-blocking start (Telegraf `launch()` never resolves)
- `app.onError()` global handler returns JSON errors, never HTML
- **New integration pattern**: optional init gated by env var (see Notion/Google in `index.ts`)
- **Context providers**: memory=priority 10, projects=9, notion=8, gmail/calendar=7, github/vercel/supabase=6. Keyword-based relevance.
- **Briefing prompts**: must explicitly instruct the agent to include each data section, or it may ignore context
- **Google OAuth tokens**: stored in `.google-token.json` (gitignored), auto-refreshes
- **Conversation history**: Agent has no DB dependency — server passes `history` array to `chat()`/`stream()`. Both web chat and Telegram persist via ConversationService.
- **ConversationService**: lives in `apps/server/src/services/conversation.ts`, uses Drizzle schema directly
- **Telegram persistence**: Conversations persist via ConversationService with 30-min thread rotation. New thread created after inactivity gap.
- **Dashboard served from Hono**: In production, Vite builds dashboard into `apps/dashboard/dist`, Hono serves it via `serveStatic`. In dev, Vite proxies `/api/*` to `:4000`.
- **Memory Quality**: `/api/memories/insights` (InsightGenerator SQL) and `/api/memories/quality` (stale/neglected/frequent analysis). Dashboard QualityPage shows overview cards, tag trends, and boost/archive actions.
- **MemorySynthesizer**: daily cron at 03:00 — dedup (>0.92 similarity), connect (clusters → AI synthesis), decay (stale -0.1 confidence), promote (frequent +0.1 importance)
- **InsightGenerator**: pure SQL pattern detection — tag trends, stalled decisions, activity rates, neglected knowledge. Feeds into briefing prompts.
- **Cross-session reasoning**: MemoryExtractor.crossReference() runs after each extraction, detects recurring themes across sessions, auto-creates pattern memories tagged `["auto-synthesis", "cross-session"]`
- **Memory source "synthesis"**: auto-generated memories are tagged with source="synthesis" to distinguish from manual/extraction
- **GitHub tracking**: plain `fetch` with Bearer token (no octokit). Auto-discovers repos via `/user/repos` if `GITHUB_REPOS` not set. Briefings include open PRs, recent commits, issues.
- **Vercel tracking**: plain `fetch` with Bearer token. Optional `teamId` for team-scoped queries. Tracks deployment state (READY/BUILDING/ERROR), build duration, commit refs.
- **Supabase awareness**: Management API at `api.supabase.com`. Monitors project health status, table row counts. Briefings flag non-healthy status.
- **Consolidated commands**: Only 2 commands needed — `/session-start` (load context + health check) and `/session-save` (commit work + extract knowledge). The separate `/commit` skill was removed; its logic is now built into `/session-save`. This prevents session log gaps (like 068-074) caused by forgetting to save.

## Rules

- **Never deploy without asking.** Do not run `/deploy`, restart the server, `git push`, or start `scripts/start.sh` without explicit user approval.
- **Check the correct directory.** Before making changes, confirm you are in `/Users/macbookpro/Documents/bodhi`. BODHI and jewelry-platform are sibling directories — never cross-edit.
- **Keep it simple.** Do not over-engineer. Prefer the smallest change that solves the problem. No speculative abstractions, extra layers, or features not requested.
- **Write accurate commit messages.** Messages must describe the actual change. Use "add" for new features, "update" for enhancements, "fix" for bugs. Never exaggerate severity or use vague messages.
- **Save output to the project.** Never save generated files, exports, or logs to `/tmp`. Use the project directory or an appropriate subdirectory.

## Dev Workflow

- `tsx watch` auto-reloads server on file changes (no manual restart needed for TS edits)
- Kill port before restart: `lsof -ti:4000 | xargs kill -9`
- Quote URLs with query params in zsh: `curl -s "http://...?param=val"`
- `googleapis` Credentials type needs `as Record<string, unknown>` cast for strict TS
- Telegram bot can timeout on startup if port is occupied — always kill stale processes first
- Test briefings: `curl -s -X POST localhost:4000/api/scheduler/trigger -H "Content-Type: application/json" -d '{"type":"morning"}'`

See `REFERENCE.md` for environment variables, API endpoint table, and deployment details.

## Session Workflow

Every Claude Code session on BODHI should follow this flow:

- **Start**: Run `/session-start` to load context from BODHI's memory (last session, pending items, today's schedule)
- **During**: Run `/reflect` when you notice patterns, hit breakthroughs, or want to capture insights mid-session
- **During**: Run `/learn` to explicitly teach BODHI something (technical or personal)
- **End**: Run `/session-save` — commits any uncommitted work, then extracts and stores all session knowledge to BODHI's memory. This is the only end-of-session command needed.

## Claude Code Infrastructure

Skills, subagents, hooks, and permissions live in `.claude/`.

### Skills (`.claude/skills/`)

Skills use SKILL.md format with YAML frontmatter for auto-invocation, tool restrictions, and forked context execution.

#### User-Invocable Skills

| Skill | Usage | Purpose |
|-------|-------|---------|
| `/start` | `/start` | **Full startup**: Check/start server + load session context |
| `/session-save` | `/session-save` | **End of session**: Commits work + extracts all session knowledge to BODHI memory |
| `/session-start` | `/session-start` | **Start of session**: Load project context, pending items, today's schedule |
| `/reflect` | `/reflect` | Mid-session checkpoint: capture insights before they're forgotten |
| `/learn` | `/learn [topic]` | Explicitly teach BODHI something (guided storage) |
| `/recall` | `/recall [query]` | Quick memory search (e.g., `/recall deployment patterns`) |
| `/briefing` | `/briefing morning` | Trigger morning/evening/weekly briefing |
| `/deploy` | `/deploy` | Build all packages, restart server, verify status |
| `/status` | `/status` | Quick health check (API + Gmail + Calendar) |
| `/review` | `/review` | Code review recent changes (forked context) |
| `/health-report` | `/health-report` | Full system health report (forked context) |

#### Auto-Invocation Skills (BODHI's Brain)

These skills Claude loads automatically when relevant — no `/` invocation needed:

| Skill | Triggers On |
|-------|-------------|
| `bodhi-patterns` | Working on BODHI code — architecture, Bridge routing, memory flow |
| `jewelry-patterns` | Working on jewelry/shigtgee code — admin pages, API routes, Supabase |
| `collaboration` | All sessions — workflow preferences, VPS guidance, communication style |
| `auto-health` | Errors, server issues, Telegram not responding |

### Subagents (`.claude/agents/`)

| Agent | Purpose |
|-------|---------|
| `build-verifier` | Run `npm run build`, report errors, suggest fixes (read-only) |
| `code-simplifier` | Review recent changes, suggest simplifications (read-only) |

### HEARTBEAT.md — Proactive Monitoring

`HEARTBEAT.md` at project root defines autonomous health check tasks. Run via `scripts/heartbeat.sh` (cron every 30 minutes). Claude Code reads the checklist and executes applicable tasks — alerts via Telegram only when issues are found.

### Hooks

- **SessionStart**: Runs `scripts/session-inject.sh` — auto-loads BODHI context (status, recent sessions, pending items, calendar, git log) into every new Claude Code session. Lighter than `/session-start`; use `/session-start` for full context.
- **SessionEnd**: Runs `scripts/session-end.sh` — stores a breadcrumb memory (timestamp, last commit, branch) so sessions aren't lost if `/session-save` is forgotten.
- **PreToolUse** (`Bash`): Deploy gate — blocks `git push`, `bash scripts/start`, `kill.*4000` without user approval. Also runs `tsc --noEmit` before `git commit`.
- **PostToolUse** (`Write|Edit`): Runs `tsc --noEmit` after every file edit to catch type errors immediately.

### Permissions (`.claude/settings.json`)

Pattern-based allow list for common commands: npm, git, curl to localhost, lsof/kill for port management.

## MCP Server (`packages/mcp-server/`)

Exposes BODHI's memory and context to Claude Code sessions via MCP protocol.

Tools: `search_memories`, `store_memory`, `store_session_summary`, `get_project_context`, `get_recent_conversations`, `get_todays_context`, `get_memory_stats`, `get_bodhi_status`

Used by skills (`/session-save`, `/session-start`, `/recall`, etc.) to persist knowledge across sessions.

## Known Issues

- **Telegraf `launch()`**: Never resolves during long-polling. Scheduler and
  all other services start independently (non-blocking telegram start).

## Build

```bash
npm run build          # builds all 14 packages
npm run build -w @seneca/scheduler  # build single package
```

## Phases

1. Bridge — Claude Code CLI subprocess ✅
2. Memory — Voyage embeddings + pgvector + Drizzle ✅
3. Dashboard — React SPA (Status, Memories, Chat) ✅
4. Scheduler — Proactive briefings via cron → Telegram ✅
5. Notion — Workspace tasks & sessions context ✅
6. Google — Gmail + Calendar (OAuth2, read-only) ✅
7. Conversations — Thread persistence + dashboard history panel ✅
8. Skills Suite — Session workflow (/session-save, /session-start, /reflect, /learn, /recall) ✅
9. Deployment — Docker + VPS setup (Dockerfile, keep-alive, configurable paths) ✅
10. Intelligence — Self-improvement loop, cross-session reasoning, proactive insights ✅
11. Dashboard on VPS + Quality — Hono serves SPA, memory quality management ✅
12. Email & Calendar Pages — Gmail inbox + Calendar dashboard (zero backend changes) ✅
13. Telegram Persistence — Conversation history persisted to DB, 30-min thread rotation ✅
14. Chat UX + Notion Dashboard — Streaming chat, Notion tasks/sessions page ✅
15. Awareness Expansion — GitHub, Vercel, Supabase monitoring + auto-capture on commit ✅
16. Skills 2.0 — SKILL.md migration, brain skills, forked-context skills, HEARTBEAT.md ✅
