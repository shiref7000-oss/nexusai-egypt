-- Workflow execution monitoring columns
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS workflow_key VARCHAR(80);
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS n8n_execution_id VARCHAR(64);
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS trigger_source VARCHAR(64);
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS queue_job_id VARCHAR(64);
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS wfrun_workflow_key_idx ON workflow_runs(workflow_key);
CREATE INDEX IF NOT EXISTS wfrun_n8n_exec_idx ON workflow_runs(n8n_execution_id);
