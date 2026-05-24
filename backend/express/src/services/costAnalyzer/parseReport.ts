import type { ParsedSheet } from './spreadsheet';

export function rawSampleToParsed(raw: {
  headers: string[];
  rows?: Record<string, unknown>[];
  sampleRows?: Record<string, unknown>[];
  rowCount: number;
}): ParsedSheet {
  const rows = raw.rows?.length ? raw.rows : raw.sampleRows || [];
  return {
    headers: raw.headers || [],
    rows,
    sampleRows: rows.slice(0, 80),
    rowCount: raw.rowCount || rows.length,
  };
}
