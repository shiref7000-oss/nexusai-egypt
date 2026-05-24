/** Parse AI output for human-readable UI (UTF-8 / Arabic safe). */

export type ParsedAiContent =
  | { mode: 'empty' }
  | { mode: 'json'; value: unknown; raw: string }
  | { mode: 'markdown'; text: string; raw: string }
  | { mode: 'text'; text: string; raw: string };

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fence =
    trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i) ||
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      return null;
    }
  }
  const start = trimmed.indexOf('{');
  const arrStart = trimmed.indexOf('[');
  const idx =
    start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);
  if (idx >= 0) {
    const slice = trimmed.slice(idx);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,3}\s/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /^[-*]\s/m.test(text) ||
    /^```/m.test(text) ||
    /_\w+_/.test(text)
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Prefer API `structured` when present; otherwise parse `response` string. */
export function parseAiContent(
  raw: string,
  structured?: unknown
): ParsedAiContent {
  const text = (raw ?? '').trim();
  if (!text && structured == null) return { mode: 'empty' };

  if (structured != null && isPlainObject(structured) && !('raw' in structured && Object.keys(structured).length === 1)) {
    return { mode: 'json', value: structured, raw: text || JSON.stringify(structured, null, 2) };
  }

  if (structured != null && Array.isArray(structured)) {
    return { mode: 'json', value: structured, raw: text || JSON.stringify(structured, null, 2) };
  }

  const parsed = text ? tryParseJson(text) : null;
  if (parsed !== null && (isPlainObject(parsed) || Array.isArray(parsed))) {
    return { mode: 'json', value: parsed, raw: text };
  }

  if (looksLikeMarkdown(text)) {
    return { mode: 'markdown', text, raw: text };
  }

  if (text) return { mode: 'text', text, raw: text };
  return { mode: 'empty' };
}

/** Flatten structured JSON into markdown for copy / fallback. */
export function structuredToMarkdown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => `- ${formatPrimitive(item)}`).join('\n');
  }
  if (!isPlainObject(value)) return String(value);

  const lines: string[] = [];
  const headline = pickString(value.headline, value.title);
  if (headline) lines.push(`## ${headline}`);

  if (value.grade != null) lines.push(`**Grade:** ${formatPrimitive(value.grade)}`);

  for (const key of [
    'summary',
    'insight',
    'response_ar',
    'response_en',
    'response',
    'confirmation_message',
    'english_version',
  ]) {
    const v = value[key];
    if (typeof v === 'string' && v.trim()) {
      lines.push('', v.trim());
    }
  }

  const sections: [string, string][] = [
    ['insights', 'Insights'],
    ['recommendations', 'Recommendations'],
    ['alerts', 'Alerts'],
    ['risks', 'Risks'],
    ['scaling_opportunities', 'Scaling opportunities'],
    ['trending_products', 'Trending products'],
    ['variations', 'Ad variations'],
    ['team_metrics', 'Team metrics'],
  ];

  for (const [key, label] of sections) {
    const arr = value[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    lines.push('', `### ${label}`);
    for (const item of arr) {
      if (typeof item === 'string') lines.push(`- ${item}`);
      else if (isPlainObject(item)) {
        const hook = pickString(item.hook, item.headline, item.title);
        const body = pickString(item.primaryText, item.text, item.description);
        if (hook) lines.push(`- **${hook}**${body ? ` — ${body}` : ''}`);
        else lines.push(`- ${formatPrimitive(item)}`);
      } else lines.push(`- ${formatPrimitive(item)}`);
    }
  }

  if (value.confidence != null) {
    lines.push('', `_Confidence: ${formatPrimitive(value.confidence)}_`);
  }

  if (lines.length === 0) {
    return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
  }
  return lines.join('\n').trim();
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function formatPrimitive(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isPlainObject(v) || Array.isArray(v)) return JSON.stringify(v);
  return String(v ?? '');
}
