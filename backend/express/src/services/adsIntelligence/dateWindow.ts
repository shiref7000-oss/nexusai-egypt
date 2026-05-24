export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_3d'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'custom';

export type DateWindow = {
  since: string; // YYYY-MM-DD (inclusive)
  until: string; // YYYY-MM-DD (inclusive)
  preset: DatePreset;
  days: number;
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
}

function diffDaysInclusive(since: Date, until: Date): number {
  const ms = until.getTime() - since.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  return Math.max(1, days);
}

export function getDateWindowFromQuery(query: Record<string, unknown>): DateWindow {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const presetRaw = String(query.preset || '').toLowerCase();
  const preset = ([
    'today',
    'yesterday',
    'last_3d',
    'last_7d',
    'last_14d',
    'last_30d',
    'last_90d',
    'custom',
  ] as const).includes(presetRaw as DatePreset)
    ? (presetRaw as DatePreset)
    : null;

  if (preset === 'custom' || query.since || query.until) {
    const sinceDate = parseIsoDate(query.since);
    const untilDate = parseIsoDate(query.until) || today;
    if (sinceDate && sinceDate <= untilDate) {
      return {
        since: toIsoDate(sinceDate),
        until: toIsoDate(untilDate),
        preset: 'custom',
        days: Math.min(365, diffDaysInclusive(sinceDate, untilDate)),
      };
    }
  }

  const toWindow = (days: number, chosenPreset: DatePreset): DateWindow => {
    const since = addDays(today, -(days - 1));
    return {
      since: toIsoDate(since),
      until: toIsoDate(today),
      preset: chosenPreset,
      days,
    };
  };

  switch (preset) {
    case 'today':
      return toWindow(1, 'today');
    case 'yesterday': {
      const y = addDays(today, -1);
      return { since: toIsoDate(y), until: toIsoDate(y), preset: 'yesterday', days: 1 };
    }
    case 'last_3d':
      return toWindow(3, 'last_3d');
    case 'last_7d':
      return toWindow(7, 'last_7d');
    case 'last_14d':
      return toWindow(14, 'last_14d');
    case 'last_90d':
      return toWindow(90, 'last_90d');
    case 'custom':
      return toWindow(30, 'last_30d');
    case 'last_30d':
    default:
      return toWindow(30, 'last_30d');
  }
}

export function previousWindow(window: DateWindow): DateWindow {
  const sinceDate = new Date(`${window.since}T00:00:00.000Z`);
  const untilDate = new Date(`${window.until}T00:00:00.000Z`);
  const days = diffDaysInclusive(sinceDate, untilDate);
  const prevUntil = addDays(sinceDate, -1);
  const prevSince = addDays(prevUntil, -(days - 1));
  return {
    since: toIsoDate(prevSince),
    until: toIsoDate(prevUntil),
    preset: 'custom',
    days,
  };
}
