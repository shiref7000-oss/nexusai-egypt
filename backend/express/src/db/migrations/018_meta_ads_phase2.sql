-- Meta Ads Phase 2: frequency/reach, creatives, alerts, AI insight cache

ALTER TABLE meta_insights_daily
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(10, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach BIGINT NOT NULL DEFAULT 0;

ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS creative_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS creative_name VARCHAR(512),
  ADD COLUMN IF NOT EXISTS creative_thumbnail_url TEXT;

-- Platform-agnostic tables (TikTok-ready)
CREATE TABLE IF NOT EXISTS ads_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL DEFAULT 'meta',
  alert_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'warning',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(16),
  entity_external_id VARCHAR(64),
  metric_snapshot JSONB,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ads_alerts_user_platform
  ON ads_alerts(user_id, platform, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ads_ai_insights_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL DEFAULT 'meta',
  period_days INTEGER NOT NULL DEFAULT 30,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_ai_insights_user
  ON ads_ai_insights_cache(user_id, platform, period_days, created_at DESC);
