-- Meta Ads integration (Phase 1 MVP)

CREATE TABLE IF NOT EXISTS meta_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  meta_user_id VARCHAR(64),
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'connected',
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(32),
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  ad_account_id VARCHAR(32) NOT NULL,
  name VARCHAR(255),
  currency VARCHAR(8) DEFAULT 'EGP',
  account_status VARCHAR(32),
  is_selected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_connection ON meta_ad_accounts(connection_id);

CREATE TABLE IF NOT EXISTS meta_campaigns (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  campaign_id VARCHAR(32) NOT NULL,
  name VARCHAR(512),
  status VARCHAR(64),
  objective VARCHAR(128),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS meta_adsets (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  adset_id VARCHAR(32) NOT NULL,
  campaign_id VARCHAR(32),
  name VARCHAR(512),
  status VARCHAR(64),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, adset_id)
);

CREATE TABLE IF NOT EXISTS meta_ads (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  ad_id VARCHAR(32) NOT NULL,
  adset_id VARCHAR(32),
  campaign_id VARCHAR(32),
  name VARCHAR(512),
  status VARCHAR(64),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, ad_id)
);

CREATE TABLE IF NOT EXISTS meta_insights_daily (
  id SERIAL PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  entity_type VARCHAR(16) NOT NULL CHECK (entity_type IN ('campaign', 'adset', 'ad')),
  entity_external_id VARCHAR(32) NOT NULL,
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
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, entity_type, entity_external_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_account_date
  ON meta_insights_daily(ad_account_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_insights_entity
  ON meta_insights_daily(entity_type, entity_external_id);
