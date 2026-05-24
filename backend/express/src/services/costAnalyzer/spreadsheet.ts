import * as XLSX from 'xlsx';
import { logger } from '../../config/logger';

const MAX_ROWS = 5000;
const SAMPLE_ROWS = 80;

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
  sampleRows: Record<string, unknown>[];
  rowCount: number;
};

const ALLOWED_EXT = new Set(['csv', 'xlsx', 'xls']);

export function validateUploadFile(file: { originalname: string; size: number; buffer?: Buffer }): void {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error('Invalid file type. Upload CSV, XLSX, or XLS only.');
  }
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('File too large. Maximum size is 10MB.');
  }
  if (!file.buffer?.length) {
    throw new Error('Empty file upload.');
  }
}

export function parseSpreadsheetBuffer(buffer: Buffer, fileName: string): ParsedSheet {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Spreadsheet has no sheets.');
    const sheet = workbook.Sheets[sheetName];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    if (!raw.length) throw new Error('Spreadsheet is empty.');

    const headerRow = (raw[0] || []).map((c) => String(c ?? '').trim());
    const headers =
      headerRow.filter(Boolean).length > 0
        ? headerRow.map((h, i) => h || `Column_${i + 1}`)
        : headerRow.map((_, i) => `Column_${i + 1}`);

    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < raw.length && rows.length < MAX_ROWS; i++) {
      const line = raw[i] || [];
      if (line.every((c) => c === '' || c == null)) continue;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = line[idx] ?? '';
      });
      rows.push(obj);
    }

    if (rows.length === 0) throw new Error('No data rows found in spreadsheet.');

    return {
      headers,
      rows,
      sampleRows: rows.slice(0, SAMPLE_ROWS),
      rowCount: rows.length,
    };
  } catch (err: unknown) {
    logger.warn('Spreadsheet parse failed', { fileName, error: err instanceof Error ? err.message : err });
    throw new Error(err instanceof Error ? err.message : 'Failed to parse spreadsheet');
  }
}

/** Heuristic fallback when AI is unavailable. */
export function heuristicExtract(parsed: ParsedSheet): Array<{
  productName: string;
  quantity: number;
  revenue: number;
}> {
  const nameKeys = ['product', 'item', 'name', 'sku', 'description', 'المنتج', 'صنف'];
  const qtyKeys = ['qty', 'quantity', 'units', 'count', 'كمية', 'الكمية'];
  const revKeys = ['revenue', 'total', 'amount', 'sales', 'price', 'إيراد', 'مبيعات', 'السعر'];

  const findCol = (keys: string[]) =>
    parsed.headers.find((h) => keys.some((k) => h.toLowerCase().includes(k)));

  const nameCol = findCol(nameKeys) || parsed.headers[0];
  const qtyCol = findCol(qtyKeys);
  const revCol = findCol(revKeys);

  const out: Array<{ productName: string; quantity: number; revenue: number }> = [];
  for (const row of parsed.rows) {
    const productName = String(row[nameCol] ?? '').trim();
    if (!productName) continue;
    const quantity = qtyCol ? parseNum(row[qtyCol]) : 1;
    const revenue = revCol ? parseNum(row[revCol]) : 0;
    out.push({ productName, quantity: quantity || 1, revenue });
  }
  return out;
}

function parseNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v ?? '').replace(/,/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
