-- Align status history columns with integration_orders.status enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_order_status_history'
      AND column_name = 'from_status'
      AND udt_name = 'public_order_status_legacy'
  ) THEN
    ALTER TABLE integration_order_status_history
      ALTER COLUMN from_status TYPE public_order_status
      USING from_status::text::public_order_status;
    ALTER TABLE integration_order_status_history
      ALTER COLUMN to_status TYPE public_order_status
      USING to_status::text::public_order_status;
  END IF;
END $$;
