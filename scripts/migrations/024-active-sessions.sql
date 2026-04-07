-- 024: Active Sessions — tracks live Claude Code sessions across tabs
-- Lightweight table, rows auto-expire via server cleanup

CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
