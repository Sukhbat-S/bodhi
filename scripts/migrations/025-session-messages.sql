-- 025: Session messages + file tracking for inter-session coordination

ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS current_file TEXT;

CREATE TABLE IF NOT EXISTS session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session TEXT NOT NULL,
  to_session TEXT,  -- null = broadcast
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup: messages older than 1 hour
CREATE INDEX IF NOT EXISTS idx_session_messages_created ON session_messages(created_at);
