-- WhatsApp per-tenant settings (COD delay, keywords, template mapping)

ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{
    "codEnabled": true,
    "codDelaySeconds": 0,
    "codTemplateKey": "cod_confirmation",
    "confirmKeywords": ["تأكيد", "تاكيد", "confirm", "yes", "نعم"],
    "cancelKeywords": ["إلغاء", "الغاء", "cancel", "no", "لا"]
  }'::jsonb;

ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS last_template_sync_at TIMESTAMPTZ;
