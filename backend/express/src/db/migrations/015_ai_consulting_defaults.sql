-- Deeper consulting responses: higher token budget and slightly higher temperature

UPDATE ai_settings
SET max_tokens = GREATEST(max_tokens, 2048),
    temperature = GREATEST(temperature, 0.70),
    json_mode = false,
    structured_output = false
WHERE id = 1;

ALTER TABLE ai_settings ALTER COLUMN max_tokens SET DEFAULT 2048;
ALTER TABLE ai_settings ALTER COLUMN temperature SET DEFAULT 0.70;
