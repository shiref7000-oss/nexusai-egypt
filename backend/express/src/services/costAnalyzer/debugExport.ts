import type { ParsedLineDebug } from './types';

export function exportDebugCsv(lines: ParsedLineDebug[]): Buffer {
  const headers = [
    'row_index',
    'included',
    'exclude_reason',
    'original_description',
    'parsed_product',
    'parsed_quantity',
    'confidence',
    'ambiguous',
    'qty_mismatch',
    'parsed_revenue',
    'order_id',
    'status',
    'original_json',
  ];
  const rows = lines.map((l) => [
    String(l.rowIndex),
    l.included ? 'yes' : 'no',
    l.excludeReason || '',
    escapeCsv(l.originalDescription || ''),
    escapeCsv(l.productName),
    String(l.quantity),
    String(l.confidence ?? ''),
    l.ambiguous ? 'yes' : 'no',
    l.quantityMismatch ? 'yes' : 'no',
    String(l.revenue),
    escapeCsv(l.orderId || ''),
    escapeCsv(l.status || ''),
    escapeCsv(JSON.stringify(l.original)),
  ]);
  const body = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return Buffer.from(body, 'utf-8');
}

function escapeCsv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
