-- Business Context Intelligence (BCI) — Phase 1 foundation
-- Embeddings stored in embedding_json; optional pgvector upgrade in 022_pgvector_optional.sql

DO $$ BEGIN
  CREATE EXTENSION vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not installed — using JSONB embeddings only';
END $$;

-- Connected store / site
CREATE TABLE IF NOT EXISTS business_store_sources (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_url TEXT NOT NULL,
  store_type VARCHAR(32) NOT NULL DEFAULT 'generic',
  last_crawl_at TIMESTAMPTZ,
  crawl_status VARCHAR(32) DEFAULT 'idle',
  last_crawl_error TEXT,
  products_found INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, store_url)
);

CREATE INDEX IF NOT EXISTS idx_business_store_sources_user ON business_store_sources(user_id);

-- Normalized product catalog
CREATE TABLE IF NOT EXISTS business_products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES business_store_sources(id) ON DELETE SET NULL,
  external_id VARCHAR(255),
  title VARCHAR(512) NOT NULL,
  description TEXT,
  category VARCHAR(255),
  price NUMERIC(14, 4),
  currency VARCHAR(8) DEFAULT 'EGP',
  image_url TEXT,
  product_url TEXT,
  offer_text TEXT,
  hero_headline TEXT,
  content_hash VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding_json JSONB NOT NULL DEFAULT '[]',
  search_text TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_business_products_user ON business_products(user_id);
CREATE INDEX IF NOT EXISTS idx_business_products_hash ON business_products(content_hash);

-- Global embedding dedupe (no re-embed unchanged text)
CREATE TABLE IF NOT EXISTS bci_embedding_cache (
  content_hash VARCHAR(64) PRIMARY KEY,
  embedding_json JSONB NOT NULL,
  model VARCHAR(64) NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crawl dedupe by URL + content hash
CREATE TABLE IF NOT EXISTS crawl_page_cache (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES business_store_sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  http_status INTEGER,
  parsed_json JSONB,
  last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, url)
);

-- Semantic chunks (products, campaigns, creatives, hooks)
CREATE TABLE IF NOT EXISTS context_chunks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(32) NOT NULL,
  source_ref VARCHAR(128) NOT NULL,
  title VARCHAR(512),
  body TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_type, source_ref, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_context_chunks_user_type ON context_chunks(user_id, source_type);

-- Campaign → product mapping (confidence-based, no LLM required)
CREATE TABLE IF NOT EXISTS campaign_product_matches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL,
  campaign_id VARCHAR(64) NOT NULL,
  campaign_name VARCHAR(512),
  product_id INTEGER NOT NULL REFERENCES business_products(id) ON DELETE CASCADE,
  confidence NUMERIC(6, 5) NOT NULL DEFAULT 0,
  match_method VARCHAR(32) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform, campaign_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_product_matches_campaign
  ON campaign_product_matches(user_id, platform, campaign_id);

-- Long-term business memory (rules + aggregates; LLM reads this, does not rebuild it)
CREATE TABLE IF NOT EXISTS business_memory_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 2: async creative pipeline (queued only — never on-demand)
CREATE TABLE IF NOT EXISTS creative_analysis_jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL,
  creative_key VARCHAR(128) NOT NULL,
  ad_external_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  creative_hash VARCHAR(64),
  result JSONB,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, platform, creative_key)
);

CREATE INDEX IF NOT EXISTS idx_creative_analysis_jobs_status
  ON creative_analysis_jobs(status, queued_at);

-- Insight cache keyed by analysis type + inputs
CREATE TABLE IF NOT EXISTS bci_insight_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cache_key VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_bci_insight_cache_expires ON bci_insight_cache(expires_at);
