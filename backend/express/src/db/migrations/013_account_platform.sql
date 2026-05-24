-- Account settings, API keys, platform-wide feature flags

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS user_api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_idx ON user_api_keys(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (key, value)
VALUES (
  'feature_flags',
  '{
    "agents_enabled": true,
    "beta_workflows": false,
    "onboarding_enabled": true,
    "experimental_ui": false,
    "maintenance_mode": false
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Seed audit samples when empty (for admin UI demos)
DO $$
DECLARE
  aid INTEGER;
  aemail VARCHAR(255);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_logs') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM admin_audit_logs LIMIT 1) THEN
    RETURN;
  END IF;
  SELECT id, email INTO aid, aemail FROM users WHERE role IN ('admin', 'superadmin') ORDER BY id LIMIT 1;
  IF aid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, target_email, old_values, new_values) VALUES
    (aid, aemail, 'UPDATE_USER', 'user', '2', 'demo@nexusai.local', '{"plan":"free"}'::jsonb, '{"plan":"pro"}'::jsonb),
    (aid, aemail, 'UPDATE_USER', 'user', '3', 'ops@nexusai.local', '{"status":"pending"}'::jsonb, '{"status":"active"}'::jsonb),
    (aid, aemail, 'IMPERSONATE_START', 'user', '4', 'viewer@nexusai.local', '{}'::jsonb, '{"reason":"support #1042"}'::jsonb),
    (aid, aemail, 'UPDATE_USER', 'user', '5', 'merchant@nexusai.local', '{"role":"user"}'::jsonb, '{"role":"moderator"}'::jsonb),
    (aid, aemail, 'IMPERSONATE_END', 'user', '4', 'viewer@nexusai.local', '{}'::jsonb, '{}'::jsonb);
END $$;
