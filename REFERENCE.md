# BODHI — Reference Guide

> Reference-only material. Not auto-loaded. See CLAUDE.md for essential patterns.

## Environment Variables (.env at monorepo root)

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
DATABASE_URL=postgresql://...
VOYAGE_API_KEY=
GOOGLE_CLIENT_ID=        # optional — enables Gmail + Calendar
GOOGLE_CLIENT_SECRET=    # optional
GOOGLE_REDIRECT_URI=     # optional (defaults to localhost:4000 callback)
GITHUB_TOKEN=            # optional — enables GitHub activity tracking
GITHUB_REPOS=            # optional — comma-separated "owner/repo" (auto-discovers if blank)
VERCEL_TOKEN=            # optional — enables Vercel deployment tracking
VERCEL_PROJECT_ID=       # optional — specific project (lists all if blank)
VERCEL_TEAM_ID=          # optional — team scope
SUPABASE_ACCESS_TOKEN=   # optional — enables Supabase health monitoring
SUPABASE_PROJECT_REF=    # optional — project ref ID
PORT=4000
```

`ANTHROPIC_API_KEY` is optional (not used — Bridge handles AI).

## API Endpoints (Hono on :4000)

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Health check |
| `/api/status` | GET | Service status |
| `/api/chat` | POST | Chat (non-streaming, accepts threadId) |
| `/api/chat/stream` | POST | SSE streaming chat (accepts threadId) |
| `/api/code` | POST | Bridge direct execution |
| `/api/memories` | GET | List memories (paginated, filterable) |
| `/api/memories` | POST | Create memory |
| `/api/memories/stats` | GET | Memory statistics |
| `/api/memories/search` | GET | Semantic vector search |
| `/api/memories/:id` | PATCH | Boost/archive memory (importanceDelta, confidenceDelta) |
| `/api/memories/:id` | DELETE | Delete memory |
| `/api/memories/insights` | GET | AI-generated memory insights |
| `/api/memories/quality` | GET | Stale, neglected, frequent memories + tag trends |
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
| `/api/conversations` | GET | List threads (paginated, newest first) |
| `/api/conversations/:id` | GET | Get thread with all turns |
| `/api/conversations/:id` | DELETE | Delete thread (cascade) |
| `/api/github/status` | GET | GitHub connection status |
| `/api/github/activity` | GET | Commits + PRs + issues combined |
| `/api/github/commits` | GET | Recent commits across repos |
| `/api/github/prs` | GET | Open pull requests |
| `/api/github/issues` | GET | Open issues |
| `/api/vercel/status` | GET | Vercel connection status |
| `/api/vercel/deployments` | GET | Recent deployments |
| `/api/supabase/status` | GET | Supabase connection status |
| `/api/supabase/health` | GET | Project health + table stats |

## Deployment (Docker / VPS)

BODHI can run 24/7 on a VPS via Docker. Target: Oracle Cloud free ARM tier ($0/mo).

### Quick Deploy

```bash
docker compose build          # Build image
docker compose up -d           # Start in background
docker compose logs -f         # Tail logs
curl localhost:4000/health     # Verify health
```

### Environment Variables for Deployment

| Variable | Purpose | Default |
|----------|---------|---------|
| `TIMEZONE` | Scheduler timezone | `UTC` |
| `BODHI_PROJECT_DIR` | Default cwd for Bridge/code commands | `process.cwd()` |
| `CORS_ORIGINS` | Extra CORS origins (comma-separated) | localhost only |

### Claude Code CLI Auth on VPS

Bridge spawns `claude` CLI as subprocess (headless, no TTY needed). Transfer auth from Mac:

```bash
scp ~/.config/claude-code/auth.json user@vps:~/.config/claude-code/auth.json
```

For Docker, mount via volume (configured in docker-compose.yml).

### Supabase Keep-Alive

Built-in `setInterval` pings database every 3 days to prevent free-tier auto-pause.

### Files

- `Dockerfile` — Multi-stage build (deps → dashboard Vite build → runtime with tsx + claude CLI)
- `docker-compose.yml` — Service config with volumes and log rotation
- `.dockerignore` — Excludes node_modules, .env, .git
- `deploy/bodhi.service` — systemd unit for boot persistence
- `scripts/deploy.sh` — Pull, build, restart, verify
- `scripts/vps-deploy.sh` — Tar, SCP, rebuild Docker on VPS from Mac
