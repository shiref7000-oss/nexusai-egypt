-- WhatsApp Cloud API — per-merchant connections, templates, messages, webhooks

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  meta_app_id VARCHAR(64),
  waba_id VARCHAR(64),
  phone_number_id VARCHAR(64),
  display_phone VARCHAR(32),
  business_name VARCHAR(255),
  access_token_enc TEXT NOT NULL,
  webhook_verify_token_hash VARCHAR(64),
  webhook_verified_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'disconnected',
  last_error TEXT,
  cod_flow_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_phone ON whatsapp_connections(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_verify_hash ON whatsapp_connections(webhook_verify_token_hash);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key VARCHAR(64) NOT NULL,
  meta_template_name VARCHAR(128) NOT NULL,
  language_code VARCHAR(16) NOT NULL DEFAULT 'ar',
  category VARCHAR(32) NOT NULL DEFAULT 'UTILITY',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  meta_status VARCHAR(32),
  rejection_reason TEXT,
  components JSONB NOT NULL DEFAULT '[]',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_user ON whatsapp_templates(user_id);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES integration_orders(id) ON DELETE SET NULL,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_type VARCHAR(32) NOT NULL DEFAULT 'template',
  template_key VARCHAR(64),
  wa_message_id VARCHAR(128),
  recipient_phone VARCHAR(32),
  sender_phone VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  body_preview TEXT,
  error_message TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON whatsapp_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order ON whatsapp_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id ON whatsapp_messages(wa_message_id);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(128) NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  phone_number_id VARCHAR(64),
  event_type VARCHAR(64) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_user ON whatsapp_webhook_events(user_id, processed_at DESC);
