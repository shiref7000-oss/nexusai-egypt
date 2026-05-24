-- Phase 1: NexusAI Engineering / Developer Agent

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  prompt TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'planning', 'running', 'review', 'completed', 'failed')),
  plan_json JSONB,
  result_report TEXT,
  error_message TEXT,
  repo_root VARCHAR(1024),
  files_touched TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_tasks_user_status_idx ON agent_tasks(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_logs (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  level VARCHAR(16) NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event_type VARCHAR(64) NOT NULL,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_logs_task_idx ON agent_task_logs(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_memory (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(32) NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform', 'user', 'project')),
  category VARCHAR(64) NOT NULL,
  key VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_platform_uq
  ON agent_memory (category, key) WHERE scope = 'platform';
CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_user_uq
  ON agent_memory (scope, user_id, category, key) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_memory_scope_idx ON agent_memory(scope, category);

CREATE TABLE IF NOT EXISTS code_index (
  id SERIAL PRIMARY KEY,
  repo_root VARCHAR(1024) NOT NULL,
  file_path VARCHAR(2048) NOT NULL,
  module_name VARCHAR(512),
  summary TEXT,
  exports JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  file_hash VARCHAR(64),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo_root, file_path)
);

CREATE INDEX IF NOT EXISTS code_index_repo_path_idx ON code_index(repo_root, file_path);
CREATE INDEX IF NOT EXISTS code_index_module_idx ON code_index(repo_root, module_name);

COMMENT ON TABLE agent_tasks IS 'Engineering agent work items';
COMMENT ON TABLE agent_task_logs IS 'Tool calls and execution events per task';
COMMENT ON TABLE agent_memory IS 'Persistent architecture and coding knowledge';
COMMENT ON TABLE code_index IS 'Repository file intelligence (search-first workflow)';
