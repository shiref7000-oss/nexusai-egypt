-- TikTok Marketing API advertiser metadata

ALTER TABLE tiktok_ad_accounts
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

ALTER TABLE tiktok_connections
  ADD COLUMN IF NOT EXISTS token_scope_type VARCHAR(32) NOT NULL DEFAULT 'marketing';

COMMENT ON COLUMN tiktok_connections.token_scope_type IS 'marketing = Business/Marketing API token; creator = Login Kit (unsupported for ads)';
