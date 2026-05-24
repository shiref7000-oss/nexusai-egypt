-- Usage tracking & plan limits (production-safe, idempotent)

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_requests BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMP;

-- Align starter plan with Basic tier in plans table
INSERT INTO plans (slug, name, description, price_usd_monthly, ai_agents_limit, workflows_limit, monthly_requests, storage_mb, team_members, ai_providers, premium_models, api_access, custom_branding, priority_support)
VALUES ('starter', 'Basic', 'Essential tools for small teams', 19, 3, 10, 1000, 1000, 3, ARRAY['groq','gemini'], FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (slug) DO UPDATE SET monthly_requests = EXCLUDED.monthly_requests, name = EXCLUDED.name;

-- Sync per-user limits from plans (starter -> plans.starter or basic)
UPDATE users u
SET monthly_request_limit = COALESCE(p.monthly_requests, 100),
    updated_at = NOW()
FROM plans p
WHERE p.slug = u.plan::text;

-- Enterprise/admin users on wrong default limit
UPDATE users SET monthly_request_limit = 100000, updated_at = NOW()
WHERE plan::text = 'enterprise' AND monthly_request_limit < 10000;

CREATE INDEX IF NOT EXISTS users_last_request_idx ON users(last_request_at DESC);
CREATE INDEX IF NOT EXISTS usage_monthly_user_month_idx ON usage_monthly(user_id, year_month);
CREATE INDEX IF NOT EXISTS aireq_user_created_idx ON ai_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS aireq_user_status_idx ON ai_requests(user_id, status);

-- Monthly reset marker on usage_monthly (reuse existing table)
COMMENT ON TABLE usage_monthly IS 'Per-user monthly usage aggregates';
