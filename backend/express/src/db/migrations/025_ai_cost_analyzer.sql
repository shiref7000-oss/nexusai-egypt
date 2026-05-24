-- AI Cost Analyzer: product costs, reports, monthly AI usage quota

CREATE TABLE IF NOT EXISTS product_costs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,
  sku VARCHAR(120),
  cost_per_unit NUMERIC(14, 4) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS product_costs_user_idx ON product_costs(user_id);

CREATE TABLE IF NOT EXISTS monthly_ai_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year_month)
);

CREATE INDEX IF NOT EXISTS monthly_ai_usage_user_month_idx ON monthly_ai_usage(user_id, year_month);

CREATE TABLE IF NOT EXISTS analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  file_name VARCHAR(500),
  file_type VARCHAR(20),
  status VARCHAR(40) NOT NULL DEFAULT 'uploaded',
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  total_revenue NUMERIC(14, 2),
  total_product_cost NUMERIC(14, 2),
  gross_profit NUMERIC(14, 2),
  gross_margin_pct NUMERIC(10, 4),
  cost_pct NUMERIC(10, 4),
  total_orders INTEGER,
  total_units NUMERIC(14, 2),
  ai_insights JSONB,
  raw_sample JSONB,
  extraction_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analysis_reports_user_created_idx ON analysis_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_reports_user_status_idx ON analysis_reports(user_id, status);

CREATE TABLE IF NOT EXISTS analysis_report_items (
  id SERIAL PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES analysis_reports(id) ON DELETE CASCADE,
  product_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,
  quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
  revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  profit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  margin_pct NUMERIC(10, 4),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS analysis_report_items_report_idx ON analysis_report_items(report_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS cost_analyzer_monthly_limit INTEGER;

COMMENT ON TABLE monthly_ai_usage IS 'AI Cost Analyzer: monthly AI extraction/analysis quota per user';
COMMENT ON COLUMN users.cost_analyzer_monthly_limit IS 'Admin override for cost analyzer AI analyses per month; NULL = plan default';
