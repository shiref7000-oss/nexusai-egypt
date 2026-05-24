export type WhatsAppSettings = {
  codEnabled: boolean;
  codDelaySeconds: number;
  codTemplateKey: string;
  confirmKeywords: string[];
  cancelKeywords: string[];
};

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  codEnabled: true,
  codDelaySeconds: 0,
  codTemplateKey: 'cod_confirmation',
  confirmKeywords: ['تأكيد', 'تاكيد', 'confirm', 'yes', 'نعم'],
  cancelKeywords: ['إلغاء', 'الغاء', 'cancel', 'no', 'لا'],
};

export function parseSettings(raw: unknown): WhatsAppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WHATSAPP_SETTINGS };
  const o = raw as Record<string, unknown>;
  return {
    codEnabled: o.codEnabled !== false,
    codDelaySeconds: Math.max(0, Math.min(3600, Number(o.codDelaySeconds) || 0)),
    codTemplateKey: String(o.codTemplateKey || 'cod_confirmation'),
    confirmKeywords: Array.isArray(o.confirmKeywords)
      ? o.confirmKeywords.map(String).filter(Boolean)
      : DEFAULT_WHATSAPP_SETTINGS.confirmKeywords,
    cancelKeywords: Array.isArray(o.cancelKeywords)
      ? o.cancelKeywords.map(String).filter(Boolean)
      : DEFAULT_WHATSAPP_SETTINGS.cancelKeywords,
  };
}

export function matchesKeyword(text: string, keywords: string[]): boolean {
  const t = text.trim().toLowerCase();
  return keywords.some((k) => {
    const key = k.trim().toLowerCase();
    return key && (t === key || t.includes(key));
  });
}
