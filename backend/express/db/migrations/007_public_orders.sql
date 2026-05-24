-- V1 public order integrations (incoming ecommerce orders)

DO $$ BEGIN
  CREATE TYPE public_order_status AS ENUM ('pending', 'confirmed', 'cancelled', 'followup');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS integration_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id VARCHAR(128) NOT NULL,
  status public_order_status NOT NULL DEFAULT 'pending',
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64) NOT NULL,
  customer_email VARCHAR(255),
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  cod_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_id, external_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_orders_idempotency_idx
  ON integration_orders (integration_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS integration_orders_user_idx
  ON integration_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS integration_orders_status_idx
  ON integration_orders (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS integration_orders_integration_idx
  ON integration_orders (integration_id, created_at DESC);

COMMENT ON TABLE integration_orders IS 'Orders received via POST /api/public/orders';
