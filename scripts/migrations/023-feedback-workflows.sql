-- BODHI Phase 23: Self-Verification + Workflows
-- Run against Supabase Postgres

-- 1. Feedback + self-assessment on conversation turns
ALTER TABLE conversation_turns ADD COLUMN IF NOT EXISTS feedback jsonb;
ALTER TABLE conversation_turns ADD COLUMN IF NOT EXISTS self_assessment jsonb;

-- 2. Memory status (pending confirmation gate)
DO $$ BEGIN
  CREATE TYPE memory_status AS ENUM ('confirmed', 'pending', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE memories ADD COLUMN IF NOT EXISTS status memory_status NOT NULL DEFAULT 'confirmed';

-- Index for fast pending lookups
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories (status) WHERE status = 'pending';

-- 3. Workflow runs tracking
DO $$ BEGIN
  CREATE TYPE workflow_run_status AS ENUM ('running', 'paused', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id text NOT NULL,
  status workflow_run_status NOT NULL DEFAULT 'running',
  current_step integer NOT NULL DEFAULT 0,
  steps_total integer NOT NULL,
  step_outputs jsonb DEFAULT '[]'::jsonb,
  pause_reason text,
  trigger text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs (status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs (workflow_id);
