-- Integrations platform (idempotent, production-safe)

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '["events:read","events:emit","webhooks:manage"]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integrations_user_idx ON integrations(user_id);
CREATE INDEX IF NOT EXISTS integrations_enabled_idx ON integrations(user_id, enabled);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhooks_integration_idx ON webhooks(integration_id);
CREATE INDEX IF NOT EXISTS webhooks_user_idx ON webhooks(user_id);

CREATE TABLE IF NOT EXISTS event_subscriptions (
  id SERIAL PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(webhook_id, event_type)
);

CREATE INDEX IF NOT EXISTS event_subscriptions_type_idx ON event_subscriptions(event_type);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id INTEGER REFERENCES integrations(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'system',
  idempotency_key VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_idempotency_idx
  ON webhook_events(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_events_user_created_idx ON webhook_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_type_idx ON webhook_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_logs_webhook_idx ON webhook_logs(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_status_idx ON webhook_logs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS webhook_logs_event_idx ON webhook_logs(event_id);

CREATE TABLE IF NOT EXISTS integration_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '["events:emit"]'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_api_keys_prefix_idx ON integration_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS integration_api_keys_integration_idx ON integration_api_keys(integration_id);

COMMENT ON TABLE integrations IS 'Per-tenant integration workspace';
COMMENT ON TABLE webhooks IS 'Outbound webhook endpoints';
COMMENT ON TABLE webhook_events IS 'Immutable event store for replay';
COMMENT ON TABLE webhook_logs IS 'Per-delivery attempt logs';
