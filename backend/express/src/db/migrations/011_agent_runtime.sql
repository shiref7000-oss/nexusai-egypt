-- Agent config + activity (integer user_id — matches production users table)

CREATE TABLE IF NOT EXISTS agent_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id VARCHAR(64) NOT NULL,
  agent_name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}',
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS agent_activities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id VARCHAR(64) NOT NULL,
  agent_name VARCHAR(120) NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_configs_user_idx ON agent_configs(user_id);
CREATE INDEX IF NOT EXISTS agent_activities_user_created_idx ON agent_activities(user_id, created_at DESC);
