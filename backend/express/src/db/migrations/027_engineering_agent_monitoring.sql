-- Phase 2: Engineering Agent admin monitoring fields

ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS current_phase VARCHAR(64) DEFAULT 'pending';
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS files_read_count INTEGER DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS files_written_count INTEGER DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS build_status VARCHAR(32);
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS build_duration_ms INTEGER;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS reasoning_summary JSONB;

CREATE INDEX IF NOT EXISTS agent_tasks_phase_idx ON agent_tasks(current_phase, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_status_updated_idx ON agent_tasks(status, updated_at DESC);

COMMENT ON COLUMN agent_tasks.current_phase IS 'Granular UI phase for admin monitor';
COMMENT ON COLUMN agent_tasks.reasoning_summary IS 'Structured agent reasoning (not chain-of-thought)';
