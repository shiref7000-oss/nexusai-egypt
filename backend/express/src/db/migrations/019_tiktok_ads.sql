-- TikTok Ads integration (platform-agnostic intelligence schema)

CREATE TABLE IF NOT EXISTS tiktok_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tiktok_user_id VARCHAR(64),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'connected',
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(32),
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tiktok_ad_accounts (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES tiktok_connections(id) ON DELETE CASCADE,
  advertiser_id VARCHAR(64) NOT NULL,
  name VARCHAR(255),
  currency VARCHAR(8) DEFAULT 'USD',
  account_status VARCHAR(32),
  is_selected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, advertiser_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_connection ON tiktok_ad_accounts(connection_id);

CREATE TABLE IF NOT EXISTS tiktok_campaigns (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES tiktok_ad_accounts(id) ON DELETE CASCADE,
  campaign_id VARCHAR(64) NOT NULL,
  name VARCHAR(512),
  status VARCHAR(64),
  objective VARCHAR(128),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS tiktok_adgroups (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES tiktok_ad_accounts(id) ON DELETE CASCADE,
  adgroup_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(64),
  name VARCHAR(512),
  status VARCHAR(64),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, adgroup_id)
);

CREATE TABLE IF NOT EXISTS tiktok_ads (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES tiktok_ad_accounts(id) ON DELETE CASCADE,
  ad_id VARCHAR(64) NOT NULL,
  adgroup_id VARCHAR(64),
  campaign_id VARCHAR(64),
  name VARCHAR(512),
  status VARCHAR(64),
  creative_id VARCHAR(64),
  creative_name VARCHAR(512),
  creative_thumbnail_url TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, ad_id)
);

CREATE TABLE IF NOT EXISTS tiktok_insights_daily (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES tiktok_ad_accounts(id) ON DELETE CASCADE,
  entity_type VARCHAR(16) NOT NULL CHECK (entity_type IN ('campaign', 'adset', 'ad')),
  entity_external_id VARCHAR(64) NOT NULL,
  metric_date DATE NOT NULL,
  spend NUMERIC(14, 4) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(10, 6) NOT NULL DEFAULT 0,
  cpc NUMERIC(14, 6) NOT NULL DEFAULT 0,
  cpm NUMERIC(14, 6) NOT NULL DEFAULT 0,
  purchases NUMERIC(14, 4) NOT NULL DEFAULT 0,
  purchase_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
  roas NUMERIC(14, 6) NOT NULL DEFAULT 0,
  frequency NUMERIC(10, 4) NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  video_views BIGINT NOT NULL DEFAULT 0,
  video_watched_2s BIGINT NOT NULL DEFAULT 0,
  video_watched_6s BIGINT NOT NULL DEFAULT 0,
  hook_rate NUMERIC(10, 6) NOT NULL DEFAULT 0,
  thumbstop_ratio NUMERIC(10, 6) NOT NULL DEFAULT 0,
  hold_rate NUMERIC(10, 6) NOT NULL DEFAULT 0,
  attribution_window VARCHAR(32) NOT NULL DEFAULT '7d_click_1d_view',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, entity_type, entity_external_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_insights_account_date
  ON tiktok_insights_daily(ad_account_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_insights_entity
  ON tiktok_insights_daily(entity_type, entity_external_id);
