/** Customer-facing AI text — Arabic only, no internal metadata. */

function pickArabicField(obj: Record<string, unknown>): string | null {
  for (const key of ['response_ar', 'arabic', 'responseAr']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function looksLikeJsonBlob(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('[') && t.endsWith(']')) ||
    t.includes('"intent"') ||
    t.includes('"sentiment"')
  );
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const v = JSON.parse(trimmed);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (m) {
      try {
        const v = JSON.parse(m[1].trim());
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Public assistant UI: show only Arabic reply text.
 * Ignores intent, sentiment, confidence, escalation, suggested_action, etc.
 */
export function extractCustomerArabic(content: string, structured?: unknown): string {
  if (structured != null && typeof structured === 'object' && !Array.isArray(structured)) {
    const ar = pickArabicField(structured as Record<string, unknown>);
    if (ar) return ar;
  }

  const fromContent = content ? parseJsonObject(content) : null;
  if (fromContent) {
    const ar = pickArabicField(fromContent);
    if (ar) return ar;
    return '';
  }

  const trimmed = (content || '').trim();
  if (trimmed && !looksLikeJsonBlob(trimmed)) return trimmed;
  return '';
}
