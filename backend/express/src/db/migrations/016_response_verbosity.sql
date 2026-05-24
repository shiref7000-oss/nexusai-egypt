-- Global output verbosity for response optimization layer

ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS response_verbosity VARCHAR(24) NOT NULL DEFAULT 'balanced';

ALTER TABLE ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_response_verbosity_check;

ALTER TABLE ai_settings
  ADD CONSTRAINT ai_settings_response_verbosity_check
  CHECK (response_verbosity IN ('concise', 'balanced', 'deep-analysis'));

UPDATE ai_settings
SET response_verbosity = 'balanced',
    max_tokens = LEAST(max_tokens, 1200)
WHERE id = 1 AND max_tokens > 1200 AND response_verbosity IS DISTINCT FROM 'deep-analysis';
