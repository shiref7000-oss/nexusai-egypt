-- Universal incoming order webhooks (V1)

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS incoming_secret VARCHAR(128);

UPDATE integrations
SET incoming_secret = encode(gen_random_bytes(32), 'hex')
WHERE incoming_secret IS NULL;

ALTER TABLE integration_orders
  ADD COLUMN IF NOT EXISTS customer_city VARCHAR(128);

CREATE TABLE IF NOT EXISTS incoming_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INTEGER NOT NULL,
  error_message TEXT,
  validation_errors JSONB,
  payload_preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_id UUID REFERENCES integration_orders(id) ON DELETE SET NULL,
  client_ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incoming_webhook_logs_integration_idx
  ON incoming_webhook_logs (integration_id, created_at DESC);

CREATE INDEX IF NOT EXISTS incoming_webhook_logs_user_idx
  ON incoming_webhook_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS incoming_webhook_logs_status_idx
  ON incoming_webhook_logs (status, created_at DESC);

COMMENT ON COLUMN integrations.incoming_secret IS 'Secret for POST /api/public/orders/:integrationId';
COMMENT ON TABLE incoming_webhook_logs IS 'Inbound order webhook request audit trail';
