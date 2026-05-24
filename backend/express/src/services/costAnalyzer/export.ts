import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import type { AiInsightsPayload, ReportItemRow, ReportTotals } from './types';

export function exportCsv(items: ReportItemRow[], totals: ReportTotals, currency: string): Buffer {
  const headers = [
    'Product',
    'Quantity',
    'Revenue',
    'Unit Cost',
    'Total Cost',
    'Profit',
    'Margin %',
  ];
  const lines = [headers.join(',')];
  for (const it of items) {
    lines.push(
      [
        csvEscape(it.productName),
        it.quantity,
        it.revenue,
        it.unitCost,
        it.totalCost,
        it.profit,
        it.marginPct ?? '',
      ].join(',')
    );
  }
  lines.push('');
  lines.push(`Total Revenue,${totals.totalRevenue}`);
  lines.push(`Total Product Cost,${totals.totalProductCost}`);
  lines.push(`Gross Profit,${totals.grossProfit}`);
  lines.push(`Gross Margin %,${totals.grossMarginPct}`);
  lines.push(`Cost %,${totals.costPct}`);
  lines.push(`Currency,${currency}`);
  return Buffer.from(lines.join('\n'), 'utf-8');
}

export function exportXlsx(
  items: ReportItemRow[],
  totals: ReportTotals,
  currency: string,
  title: string
): Buffer {
  const rows = items.map((it) => ({
    Product: it.productName,
    Quantity: it.quantity,
    Revenue: it.revenue,
    'Unit Cost': it.unitCost,
    'Total Cost': it.totalCost,
    Profit: it.profit,
    'Margin %': it.marginPct,
  }));
  const summary = [
    { Metric: 'Total Revenue', Value: totals.totalRevenue },
    { Metric: 'Total Product Cost', Value: totals.totalProductCost },
    { Metric: 'Gross Profit', Value: totals.grossProfit },
    { Metric: 'Gross Margin %', Value: totals.grossMarginPct },
    { Metric: 'Cost %', Value: totals.costPct },
    { Metric: 'Currency', Value: currency },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Products');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

export function exportPdf(
  items: ReportItemRow[],
  totals: ReportTotals,
  currency: string,
  title: string,
  insights?: AiInsightsPayload | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(title || 'AI Cost Analyzer Report', { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Currency: ${currency}`);
    doc.text(`Total Revenue: ${totals.totalRevenue}`);
    doc.text(`Total Product Cost: ${totals.totalProductCost}`);
    doc.text(`Gross Profit: ${totals.grossProfit}`);
    doc.text(`Gross Margin: ${totals.grossMarginPct}%`);
    doc.moveDown();

    if (insights?.executiveSummary) {
      doc.fontSize(12).text('Executive Summary', { underline: true });
      doc.fontSize(10).text(insights.executiveSummary);
      doc.moveDown();
    }

    doc.fontSize(12).text('Products', { underline: true });
    doc.fontSize(8);
    const header = 'Product | Qty | Revenue | Cost | Profit | Margin%';
    doc.text(header);
    for (const it of items.slice(0, 40)) {
      doc.text(
        `${it.productName.slice(0, 28)} | ${it.quantity} | ${it.revenue} | ${it.totalCost} | ${it.profit} | ${it.marginPct ?? '-'}`
      );
    }
    if (items.length > 40) doc.text(`... and ${items.length - 40} more products`);

    doc.end();
  });
}

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
