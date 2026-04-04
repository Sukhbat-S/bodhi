#!/bin/bash
cat << 'EOF'

  🌳 BODHI — Architecture
  ────────────────────────

  apps/
    server/              — Hono API (port 4000)
    dashboard/           — React 19 + Vite + Tailwind

  packages/
    core/                — Agent + ContextEngine
    bridge/              — Claude Code CLI ($0 AI)
    db/                  — Drizzle ORM + pgvector
    memory/              — Embeddings + Synthesis
    google/              — Gmail + Calendar
    knowledge/           — Notion integration
    github/              — Commit/PR tracking
    vercel/              — Deploy monitoring
    supabase-awareness/  — Project health
    mcp-server/          — MCP protocol (8 tools)
    scheduler/           — Cron briefings
    channels/
      telegram/          — Telegraf bot

  14 packages · TypeScript ESM · MIT License

EOF
