-- AI provider orchestration: request logging indexes + optional rollup view
CREATE INDEX IF NOT EXISTS idx_ai_requests_provider_created
  ON ai_requests (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_requests_status_created
  ON ai_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_requests_agent_metadata
  ON ai_requests ((metadata->>'agent'), created_at DESC)
  WHERE metadata IS NOT NULL;

COMMENT ON COLUMN ai_requests.provider IS 'groq | gemini | openrouter | openai';
COMMENT ON COLUMN ai_requests.model IS 'Model id e.g. llama-3.1-8b-instant, gemini-1.5-flash';
