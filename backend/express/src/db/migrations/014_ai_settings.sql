-- Platform AI runtime settings (single-row config, hot-reloaded by API)

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  primary_provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
  fallback_provider VARCHAR(32) NOT NULL DEFAULT 'groq',
  primary_model VARCHAR(80) NOT NULL DEFAULT 'gemini-2.5-flash',
  fallback_model VARCHAR(80) NOT NULL DEFAULT 'llama-3.1-8b-instant',
  temperature NUMERIC(4, 2) NOT NULL DEFAULT 0.60,
  max_tokens INTEGER NOT NULL DEFAULT 700,
  top_p NUMERIC(4, 2) NOT NULL DEFAULT 0.95,
  soft_limit_usd NUMERIC(10, 2) NOT NULL DEFAULT 3.00,
  hard_limit_usd NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
  json_mode BOOLEAN NOT NULL DEFAULT false,
  structured_output BOOLEAN NOT NULL DEFAULT false,
  debug_mode BOOLEAN NOT NULL DEFAULT false,
  openai_enabled BOOLEAN NOT NULL DEFAULT false,
  extended_fallback BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
