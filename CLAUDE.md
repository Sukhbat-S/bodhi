# BODHI — Project Intelligence File

> Personal AI companion for Sukhbat. Built as a TypeScript monorepo.
> Version tracked in root `package.json` — currently v0.9.0.

## Quick Start

```bash
cd ~/Documents/bodhi
bash scripts/start.sh            # Single server: API + Dashboard on :4000
bash scripts/start.sh --dev      # Dev mode: API on :4000 + Vite HMR on :5173
```

Auto-start on terminal open: `source ~/Documents/bodhi/scripts/bodhi-autostart.sh` in `.zshrc`

## Architecture

Monorepo with npm workspaces. 15 packages, all TypeScript ESM.

```
packages/
  core/                — Agent + ContextEngine (AIBackend interface)
  bridge/              — Claude Code CLI subprocess ($0 via Max subscription)
  anthropic/           — Anthropic API backend (alternative to Bridge, for users without Max)
  db/                  — Drizzle ORM + Supabase Postgres (pgvector)
  memory/              — MemoryService + MemoryExtractor + GoalContextProvider
  google/              — Gmail + Calendar (shared OAuth2, read-only)
  knowledge/           — Notion knowledge base context provider
  github/              — GitHub activity tracking (commits, PRs, issues)
  vercel/              — Vercel deployment tracking
  supabase-awareness/  — Supabase project health monitoring
  mcp-server/          — MCP server for Claude Code integration (10 tools)
  scheduler/           — node-cron proactive briefings (morning/evening/weekly/build-digest)
  social/              — Social media integrations
  channels/
    telegram/          — Telegraf bot (single-user, allowedUserId gated)
apps/
  server/              — Hono API (port 4000) + all service wiring
  dashboard/           — React 19 + Vite 6 + Tailwind 3 SPA (17 pages)
```

### Dashboard Pages

Reflection (home), Chat, Search, Memories, Entities, Briefings, Timeline, Calendar, Inbox, GitHub, Vercel, Supabase, Notion, Ecosystem, Status, Quality, About (public landing page).

### Deployment

- **Local/VPS**: Hono serves API + static dashboard on port 4000
- **Landing page**: Vercel at `dashboard-chi-plum.vercel.app/about` (static only, no backend)
- **Vercel SPA routing**: `vercel.json` with catch-all rewrite to `index.html`

## Key Patterns

- **AI Backend**: Agent uses `AIBackend` interface. Two implementations: `Bridge` (Claude Code CLI, $0 with Max) and `AnthropicBackend` (API, for users without Max). Server selects based on `AI_BACKEND` env var.
- Memory uses Voyage AI (`voyage-4-lite`) for embeddings, pgvector for cosine similarity search
- **Memory types**: fact, decision, pattern, preference, event, goal
- **Context providers** (priority order): memory=10, goals=9.5, projects=9, entities=8, notion=8, gmail/calendar=7, github/vercel/supabase=6. **Intent-aware**: ContextEngine classifies messages (quick/code/memory/full) and only fires relevant providers with dynamic token budgets.
- **Background watcher**: KAIROS-lite runs every 5min — alerts on Vercel deploy errors, new GitHub PRs, Gmail inbox spikes via Telegram.
- **Smart synthesis**: MemorySynthesizer checks every 4h with 3-gate trigger (12h since last + 3 new memories + no lock) instead of fixed 03:00 cron.
- **Ultraplan**: Available on Max 20x. Use `/ultraplan` for large refactors — plans in cloud while terminal stays free. Supports inline comments, section-level review, execute on web or teleport back to terminal.
- Telegram bot: single-user only, `allowedUserId` from env
- Dashboard proxies `/api/*` to `:4000` via Vite config
- Scheduler: non-blocking start (Telegraf `launch()` never resolves)
- `app.onError()` global handler returns JSON errors, never HTML
- **Integration pattern**: optional init gated by env var (see Notion/Google in `index.ts`)
- **Briefing prompts**: must explicitly instruct the agent to include each data section, or it may ignore context
- **Google OAuth tokens**: stored in `.google-token.json` (gitignored), auto-refreshes
- **Conversation history**: Agent has no DB dependency — server passes `history` array to `chat()`/`stream()`. Both web chat and Telegram persist via ConversationService.
- **ConversationService**: lives in `apps/server/src/services/conversation.ts`, uses Drizzle schema directly
- **Telegram persistence**: Conversations persist via ConversationService with 30-min thread rotation
- **Dashboard served from Hono**: In production, Vite builds dashboard into `apps/dashboard/dist`, Hono serves it via `serveStatic`. In dev, Vite proxies `/api/*` to `:4000`.
- **Memory Quality**: `/api/memories/insights` (InsightGenerator SQL) and `/api/memories/quality` (stale/neglected/frequent analysis)
- **MemorySynthesizer**: every 4h (gated by `shouldRun()`: 12h since last + 3 new memories + no concurrent lock) — dedup (>0.92 similarity), connect (clusters → AI synthesis), decay (stale -0.1 confidence), promote (frequent +0.1 importance), auto-confirm pending memories >7d, apply feedback signals (unhelpful → -0.05 confidence, helpful → +0.05 importance)
- **InsightGenerator**: pure SQL pattern detection — tag trends, stalled decisions, activity rates, neglected knowledge
- **Cross-session reasoning**: MemoryExtractor.crossReference() detects recurring themes across sessions, auto-creates pattern memories tagged `["auto-synthesis", "cross-session"]`
- **GoalContextProvider**: priority 9.5, injects active goals into every conversation. Flags stale goals (>14d check progress, >30d ask if still active)
- **Content engine**: `/api/content/buildlog` reads local git log first, falls back to GitHub API. `/api/content/weekly-digest` for 7-day summaries. Build-digest cron runs Mondays at 10:00.
- **Onboarding detection**: Server checks if < 5 memories exist, injects warmth context for new users
- **Command palette**: Cmd+K global shortcut, 22 commands (navigation + actions)
- **Landing page**: `/about` route, full-width (no sidebar), sample data for search demo (no real API calls), live status from `/api/status`
- **Version**: Single source of truth in root `package.json`, injected via Vite `define` as `__APP_VERSION__`
- **Consolidated commands**: Only 2 commands needed — `/session-start` and `/session-save`
- **Feedback loops**: Thumbs up/down on chat messages stored as JSONB on `conversation_turns`. Dashboard ChatMessage shows hover-reveal buttons. Feedback signals feed into nightly synthesis.
- **Memory confirmation gate**: MemoryExtractor stores memories as `pending`. User confirms/rejects in Memories dashboard. Synthesizer auto-confirms after 7 days. `retrieve()` only returns `confirmed` memories.
- **Self-assessment**: Optional (env `BODHI_SELF_ASSESS=true`). SelfAssessor rates each response 1-5 via sonnet, stored as JSONB on conversation turns.
- **Workflow engine**: `Agent.runWorkflow()` iterates steps, each step's output becomes context for the next via `<workflow>` XML blocks. 1M token context IS the state machine. Steps support dynamic prompts, conditional execution, model override, and pause/resume.
- **Workflow definitions**: `packages/scheduler/src/workflows/` — morning-research (4 steps), deploy-verify (3 steps), weekly-synthesis (3 steps). Triggered via `/api/workflows/:id/run` or MCP `trigger_workflow` tool.
- **Dashboard code-splitting**: All pages lazy-loaded via `React.lazy`. Main bundle ~290K.

## Dev Workflow

- `tsx watch` auto-reloads server on file changes (no manual restart needed for TS edits)
- Kill port before restart: `lsof -ti:4000 | xargs kill -9`
- Quote URLs with query params in zsh: `curl -s "http://...?param=val"`
- Telegram bot can timeout on startup if port is occupied — always kill stale processes first
- Test briefings: `curl -s -X POST localhost:4000/api/scheduler/trigger -H "Content-Type: application/json" -d '{"type":"morning"}'`

See `REFERENCE.md` for environment variables, API endpoint table, and deployment details.

## Session Workflow

Every Claude Code session on BODHI should follow this flow:

- **Start**: Run `/session-start` to load context from BODHI's memory
- **During**: Run `/reflect` for mid-session insights or `/learn` to teach BODHI something
- **End**: Run `/session-save` — commits work + extracts session knowledge to BODHI's memory

## Claude Code Infrastructure

Skills, subagents, hooks, and permissions live in `.claude/`.

### Skills (`.claude/skills/`)

#### User-Invocable Skills

| Skill | Purpose |
|-------|---------|
| `/start` | Full startup: check/start server + load session context |
| `/session-save` | End of session: commit work + extract knowledge |
| `/session-start` | Start of session: load context, pending items, schedule |
| `/reflect` | Mid-session checkpoint: capture insights |
| `/learn` | Explicitly teach BODHI something |
| `/recall` | Quick memory search |
| `/briefing` | Trigger morning/evening/weekly briefing |
| `/buildlog` | Generate build-in-public post from git + memories |
| `/deploy` | Build all packages, restart server, verify |
| `/status` | Quick health check |
| `/review` | Code review recent changes (forked context) |
| `/health-report` | Full system health report (forked context) |

#### Auto-Invocation Skills (BODHI's Brain)

| Skill | Triggers On |
|-------|-------------|
| `bodhi-patterns` | Working on BODHI code |
| `jewelry-patterns` | Working on jewelry/shigtgee code |
| `collaboration` | All sessions — workflow preferences |
| `auto-health` | Errors, server issues |

### Subagents (`.claude/agents/`)

| Agent | Purpose |
|-------|---------|
| `build-verifier` | Run `npm run build`, report errors (read-only) |
| `code-simplifier` | Review changes, suggest simplifications (read-only) |

### Hooks

- **PostToolUse** (`Write|Edit`): Runs `tsc --noEmit` after every file edit.

### Permissions (`.claude/settings.json`)

Pattern-based allow list for common commands: npm, git, curl to localhost, lsof/kill.

## MCP Server (`packages/mcp-server/`)

Exposes BODHI's memory and context to Claude Code sessions via MCP protocol.

Tools: `search_memories`, `store_memory`, `store_session_summary`, `get_project_context`, `get_recent_conversations`, `get_todays_context`, `get_memory_stats`, `get_bodhi_status`, `generate_build_log`, `generate_weekly_digest`, `get_insights`, `extract_memories`, `get_workflows`, `trigger_workflow`

## Security Notes

- **No auth middleware on API** — server assumes single-user, local/VPS access only
- **Landing page on Vercel is static-only** — no backend, no real data exposed, search demo uses sample data
- **Before exposing server publicly**: must add bearer token auth middleware to all `/api/*` routes
- All secrets in `.env` (gitignored). Never commit `.env`, `.google-token.json`, `*.key`, `*.pem`

## Known Issues

- **Telegraf `launch()`**: Never resolves during long-polling. All services start independently.
- **X/Twitter API**: Credits depleted (402) — posting works via web, API read limited

## Build

```bash
npm run build          # builds all 15 packages
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
9. Deployment — Docker + VPS setup (Dockerfile, keep-alive) ✅
10. Intelligence — Self-improvement loop, cross-session reasoning, proactive insights ✅
11. Dashboard on VPS + Quality — Hono serves SPA, memory quality management ✅
12. Email & Calendar Pages — Gmail inbox + Calendar dashboard ✅
13. Telegram Persistence — Conversation history persisted to DB ✅
14. Chat UX + Notion Dashboard — Streaming chat, Notion tasks/sessions page ✅
15. Awareness Expansion — GitHub, Vercel, Supabase monitoring ✅
16. Skills 2.0 — SKILL.md migration, brain skills, forked-context skills ✅
17. Soul — Goal tracking, onboarding warmth, reflective briefings ✅
18. Content Engine — Build log generation, weekly digest, /buildlog skill ✅
19. Voice — macOS TTS scripts (voice.sh, morning.sh) ✅
20. Landing Page — Public /about page on Vercel, audience-focused messaging ✅
21. Anthropic Backend — AIBackend alternative for users without Claude Max ✅
22. Open Source — README, .env.example, setup wizard, CI, deploy templates ✅
23. Self-Verification + Workflows — Feedback loops, memory confirmation gate, self-assessment, workflow engine, dashboard code-splitting ✅
