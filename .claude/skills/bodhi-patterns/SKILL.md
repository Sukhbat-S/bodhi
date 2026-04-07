---
name: bodhi-patterns
description: BODHI architecture patterns and conventions. Auto-load when working on BODHI code — monorepo structure, Bridge CLI routing, memory embedding flow, context providers, env var patterns.
user-invocable: false
---

# BODHI Architecture Patterns

## Monorepo Structure

TypeScript ESM monorepo with npm workspaces. 15 packages under `packages/`, 2 apps under `apps/`.

- Agent (`packages/core/`) uses `AIBackend` interface with two implementations:
  - `Bridge` (`packages/bridge/`) — Claude Code CLI subprocess ($0 via Max subscription)
  - `AnthropicBackend` (`packages/anthropic/`) — Anthropic API (for users without Max)
- Server selects backend via `AI_BACKEND` env var (default: bridge)
- Server (`apps/server/`) wires everything together with Hono on port 4000
- Dashboard (`apps/dashboard/`) is React 19 + Vite 6 + Tailwind 3 SPA on port 5173

## Bridge Pattern

```
User → Telegram/Web → Agent.chat() → Bridge.generate() → claude CLI subprocess → response
```

- Bridge spawns `claude -p` with `--output-format stream-json`
- Uses Max subscription ($0 per call) — no API key needed
- `ANTHROPIC_API_KEY` env var is optional/unused

## Memory Embedding Flow

```
Input text → Voyage AI embeddings → pgvector (Supabase Postgres) → similarity search
```

- `packages/memory/` handles MemoryService + MemoryExtractor
- `MemoryContextProvider` (priority 10) injects relevant memories into agent context
- `MemorySynthesizer`: every 4h (gated by shouldRun: 12h + 3 sessions + no lock) — dedup, cluster, decay, promote
- `InsightGenerator`: pure SQL pattern detection for briefing prompts

## Context Provider Pattern

Providers implement `ContextProvider` interface with `priority` (higher = loaded first) and `getContext(query)`.

Priority order: memory=10, goals=9.5, projects=9, entities=8, notion=8, gmail/calendar=7, github/vercel/supabase=6.

Keyword-based relevance filtering in each provider.

**Intent-aware gathering** (new): ContextEngine classifies messages by intent before selecting providers:
- `quick` (schedule/email): Calendar + Gmail, 2K budget
- `code` (deploy/PR/build): Memory + GitHub + Vercel + Supabase, 6K budget
- `memory` (remember/decided): Memory + Goals + Entities + Projects, 8K budget
- `full` (briefings/complex): all providers, 16K budget

## Background Watcher (KAIROS-lite)

Every 5 minutes, Scheduler checks for real-time events:
- Vercel deploy ERROR → Telegram alert
- New GitHub PRs → Telegram notification
- Gmail inbox spike (>5 new unread) → Telegram alert
Dedup via in-memory state tracking. Gated by service availability.

## Integration Init Pattern

New integrations follow the optional-init pattern in `apps/server/src/index.ts`:
```typescript
if (process.env.SOME_TOKEN) {
  const service = new SomeService(process.env.SOME_TOKEN);
  // register routes, context providers
} else {
  console.log('Service: disabled (no SOME_TOKEN)');
}
```

## Conversation Flow

- Agent has NO DB dependency — server passes `history` array to `chat()`/`stream()`
- ConversationService lives in `apps/server/src/services/conversation.ts`
- Telegram: 30-min thread rotation via ConversationService
- Web: threadId passed in request body

## Build & Dev

- `tsx watch` auto-reloads server — no manual restart for TS edits
- Kill port before restart: `lsof -ti:4000 | xargs kill -9`
- Quote URLs with query params in zsh: `curl -s "http://...?param=val"`
- `app.onError()` global handler returns JSON, never HTML

## Dashboard Serving

- Dev: Vite proxies `/api/*` to `:4000`
- Production: Hono serves Vite build from `apps/dashboard/dist` via `serveStatic`
