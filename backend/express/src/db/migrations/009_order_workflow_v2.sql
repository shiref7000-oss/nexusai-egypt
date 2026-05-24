-- Order workflow v2 + status history + raw payload storage

ALTER TABLE integration_orders
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

ALTER TABLE incoming_webhook_logs
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- Migrate enum to workflow statuses
DO $$ BEGIN
  ALTER TYPE public_order_status RENAME TO public_order_status_legacy;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public_order_status AS ENUM (
    'new',
    'pending_confirmation',
    'confirmed',
    'cancelled',
    'shipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_orders'
      AND column_name = 'status'
      AND udt_name = 'public_order_status_legacy'
  ) THEN
    ALTER TABLE integration_orders
      ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE integration_orders
      ALTER COLUMN status TYPE public_order_status USING (
        CASE status::text
          WHEN 'confirmed' THEN 'confirmed'::public_order_status
          WHEN 'cancelled' THEN 'cancelled'::public_order_status
          WHEN 'pending' THEN 'pending_confirmation'::public_order_status
          WHEN 'followup' THEN 'new'::public_order_status
          WHEN 'shipped' THEN 'shipped'::public_order_status
          WHEN 'new' THEN 'new'::public_order_status
          WHEN 'pending_confirmation' THEN 'pending_confirmation'::public_order_status
          ELSE 'new'::public_order_status
        END
      );
    ALTER TABLE integration_orders
      ALTER COLUMN status SET DEFAULT 'new'::public_order_status;
  ELSIF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'public_order_status' AND e.enumlabel = 'pending'
  ) THEN
    ALTER TABLE integration_orders ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE integration_orders
      ALTER COLUMN status TYPE text USING status::text;
    DROP TYPE public_order_status CASCADE;
    CREATE TYPE public_order_status AS ENUM (
      'new', 'pending_confirmation', 'confirmed', 'cancelled', 'shipped'
    );
    ALTER TABLE integration_orders
      ALTER COLUMN status TYPE public_order_status USING (
        CASE status
          WHEN 'confirmed' THEN 'confirmed'::public_order_status
          WHEN 'cancelled' THEN 'cancelled'::public_order_status
          WHEN 'pending' THEN 'pending_confirmation'::public_order_status
          WHEN 'followup' THEN 'new'::public_order_status
          ELSE 'new'::public_order_status
        END
      );
    ALTER TABLE integration_orders
      ALTER COLUMN status SET DEFAULT 'new'::public_order_status;
  END IF;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS public_order_status_legacy;
EXCEPTION
  WHEN dependent_objects_still_exist THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS integration_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES integration_orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status public_order_status,
  to_status public_order_status NOT NULL,
  changed_by VARCHAR(128) NOT NULL DEFAULT 'system',
  source VARCHAR(64) NOT NULL DEFAULT 'webhook',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_order_status_history_order_idx
  ON integration_order_status_history (order_id, created_at DESC);

COMMENT ON TABLE integration_order_status_history IS 'Audit trail for integration order status changes';
