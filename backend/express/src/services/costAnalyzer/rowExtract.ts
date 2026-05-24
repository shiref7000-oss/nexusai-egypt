import {
  descriptionHasExplicitQuantity,
  looksLikeShipmentDescription,
  parseShipmentDescription,
} from './descriptionParse';
import { applyProductAlias, mergeDuplicateProducts, normalizeProductName } from './normalize';
import type { ParsedSheet } from './spreadsheet';
import type {
  ColumnMappingConfig,
  ExtractedProduct,
  ExtractionPreviewLine,
  ParsedLineDebug,
  Reconciliation,
} from './types';

const CANCELLED = [
  'cancel',
  'cancelled',
  'canceled',
  'ملغي',
  'ملغى',
  'الغاء',
  'إلغاء',
  'rejected',
  'رفض',
];
const RETURNED = ['return', 'returned', 'refund', 'refunded', 'مرتجع', 'استرجاع', 'مسترد'];

function parseNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.\-]/g, '')
    .trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normStatus(s: string) {
  return s.toLowerCase().trim();
}

function matchesAny(status: string, patterns: string[]) {
  const n = normStatus(status);
  return patterns.some((p) => n.includes(p));
}

function statusAllowed(
  status: string,
  filters: ColumnMappingConfig['orderFilters']
): { ok: boolean; reason?: string } {
  const s = String(status || '').trim();
  if (!s) return { ok: true };

  if (filters.excludeCancelled && matchesAny(s, CANCELLED)) {
    return { ok: false, reason: 'Cancelled order' };
  }
  if (filters.excludeReturned && matchesAny(s, RETURNED)) {
    return { ok: false, reason: 'Returned / refunded order' };
  }

  if (filters.includeOnlyStatuses.length > 0) {
    const allowed = filters.includeOnlyStatuses.map((x) => normStatus(x));
    const n = normStatus(s);
    const hit = allowed.some((a) => n.includes(a) || a.includes(n));
    if (!hit) return { ok: false, reason: `Status not in filter: ${s}` };
  }

  return { ok: true };
}

function lineRevenue(
  row: Record<string, unknown>,
  mapping: ColumnMappingConfig,
  quantity: number,
  totalLineQty: number
): number {
  const mode = mapping.revenueMode;
  const lineTotal = parseNum(row[mapping.revenue]);
  if (mode === 'unit_price_x_qty') {
    const priceCol = mapping.unitPrice || mapping.revenue;
    const unit = parseNum(row[priceCol]);
    return round2(unit * quantity);
  }
  if (totalLineQty > 0 && quantity > 0) {
    return round2((lineTotal / totalLineQty) * quantity);
  }
  return round2(lineTotal);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

type LineItem = { productName: string; quantity: number; revenue: number };

function resolveLineItems(
  description: string,
  row: Record<string, unknown>,
  mapping: ColumnMappingConfig
): {
  items: LineItem[];
  parsedProducts: ParsedLineDebug['parsedProducts'];
  confidence: number;
  ambiguous: boolean;
} {
  const columnQty = mapping.quantity ? parseNum(row[mapping.quantity]) : 0;
  const bundleMult = mapping.bundleMultiplier ? parseNum(row[mapping.bundleMultiplier]) : 1;
  const useDescription =
    looksLikeShipmentDescription(description) ||
    descriptionHasExplicitQuantity(description) ||
    !mapping.quantity;

  if (useDescription) {
    const parsed = parseShipmentDescription(description);
    if (parsed.length > 0) {
      const items: LineItem[] = parsed.map((p) => {
        let qty = p.quantity;
        if (qty <= 0) qty = 1;
        if (mapping.bundleMultiplier && bundleMult > 1) {
          qty = round2(qty * bundleMult);
        }
        return {
          productName: applyProductAlias(p.productName),
          quantity: qty,
          revenue: 0,
        };
      });

      const totalQty = items.reduce((s, i) => s + i.quantity, 0);
      if (parsed.length === 1 && columnQty > 0 && !descriptionHasExplicitQuantity(description)) {
        items[0].quantity = round2(columnQty * (bundleMult > 0 ? bundleMult : 1));
      } else if (parsed.length === 1 && columnQty > 0 && items[0].quantity === 1 && columnQty > 1) {
        items[0].quantity = round2(columnQty * (bundleMult > 0 ? bundleMult : 1));
      }

      const minConf = Math.min(...parsed.map((p) => p.confidence));
      const anyAmb = parsed.some((p) => p.ambiguous);
      return {
        items,
        parsedProducts: parsed.map((p, idx) => ({
          productName: items[idx]?.productName || p.productName,
          quantity: items[idx]?.quantity ?? p.quantity,
          confidence: p.confidence,
          ambiguous: p.ambiguous,
          quantitySource: p.quantitySource,
        })),
        confidence: minConf,
        ambiguous: anyAmb,
      };
    }
  }

  const name = applyProductAlias(description);
  let qty = 1;
  let confidence = 0.5;
  let ambiguous = false;
  let source = 'bundle_default';

  if (columnQty > 0) {
    qty = round2(columnQty * (bundleMult > 0 ? bundleMult : 1));
    confidence = 0.75;
    source = 'column_override';
  } else if (descriptionHasExplicitQuantity(description)) {
    const reparsed = parseShipmentDescription(description);
    if (reparsed[0] && reparsed[0].quantity > 0) {
      qty = reparsed[0].quantity;
      confidence = reparsed[0].confidence;
      ambiguous = reparsed[0].ambiguous;
      source = reparsed[0].quantitySource;
    }
  }

  return {
    items: [{ productName: name, quantity: qty, revenue: 0 }],
    parsedProducts: [
      {
        productName: name,
        quantity: qty,
        confidence,
        ambiguous,
        quantitySource: source,
      },
    ],
    confidence,
    ambiguous,
  };
}

export function extractFromRows(
  parsed: ParsedSheet,
  mapping: ColumnMappingConfig
): {
  products: ExtractedProduct[];
  reconciliation: Reconciliation;
  debugLines: ParsedLineDebug[];
  previewLines: ExtractionPreviewLine[];
} {
  const debugLines: ParsedLineDebug[] = [];
  const previewLines: ExtractionPreviewLine[] = [];
  const excludedByStatus: Record<string, number> = {};
  const orderIds = new Set<string>();
  let rowsProcessed = 0;
  let rowsExcluded = 0;
  let unitsCounted = 0;
  let quantityMismatches = 0;
  let expectedUnitsTotal = 0;
  let hasExpectedColumn = false;

  const lineRows: LineItem[] = [];

  parsed.rows.forEach((row, rowIndex) => {
    const status = mapping.status ? String(row[mapping.status] ?? '').trim() : '';
    const orderId = mapping.orderId ? String(row[mapping.orderId] ?? '').trim() : undefined;
    const description = String(row[mapping.product] ?? '').trim();

    const filter = statusAllowed(status, mapping.orderFilters);

    if (!filter.ok) {
      rowsExcluded++;
      const key = filter.reason || status || 'excluded';
      excludedByStatus[key] = (excludedByStatus[key] || 0) + 1;
      debugLines.push({
        rowIndex,
        included: false,
        excludeReason: filter.reason,
        productName: description || '—',
        quantity: 0,
        revenue: 0,
        orderId,
        status: status || undefined,
        originalDescription: description,
        original: row,
      });
      return;
    }

    if (!description) {
      rowsExcluded++;
      debugLines.push({
        rowIndex,
        included: false,
        excludeReason: 'Empty shipment description',
        productName: '—',
        quantity: 0,
        revenue: 0,
        orderId,
        status: status || undefined,
        original: row,
      });
      return;
    }

    const { items, parsedProducts, confidence, ambiguous } = resolveLineItems(description, row, mapping);
    const lineQtySum = items.reduce((s, i) => s + i.quantity, 0);

    let expectedCount: number | null = null;
    if (mapping.shippedItemCount) {
      const exp = parseNum(row[mapping.shippedItemCount]);
      if (exp > 0) {
        expectedCount = exp;
        hasExpectedColumn = true;
        expectedUnitsTotal += exp;
      }
    }

    const quantityMismatch =
      expectedCount != null && Math.abs(lineQtySum - expectedCount) > 0.001;
    if (quantityMismatch) quantityMismatches++;

    if (lineQtySum <= 0) {
      rowsExcluded++;
      debugLines.push({
        rowIndex,
        included: false,
        excludeReason: 'Zero quantity after parse',
        productName: description,
        quantity: 0,
        revenue: 0,
        orderId,
        status: status || undefined,
        originalDescription: description,
        parsedProducts,
        confidence,
        ambiguous,
        quantityMismatch,
        original: row,
      });
      return;
    }

    const totalLineQty = lineQtySum;
    for (const item of items) {
      const revenue = lineRevenue(row, mapping, item.quantity, totalLineQty);
      lineRows.push({
        productName: item.productName,
        quantity: item.quantity,
        revenue,
      });

      rowsProcessed++;
      unitsCounted += item.quantity;

      debugLines.push({
        rowIndex,
        included: true,
        productName: item.productName,
        quantity: item.quantity,
        revenue,
        orderId,
        status: status || undefined,
        originalDescription: description,
        parsedProducts,
        confidence,
        ambiguous,
        quantityMismatch,
        original: row,
      });

      previewLines.push({
        rowIndex,
        originalDescription: description,
        parsedProduct: item.productName,
        parsedQuantity: item.quantity,
        confidence,
        ambiguous: ambiguous || quantityMismatch,
        included: true,
      });
    }

    if (orderId) orderIds.add(orderId);
  });

  const products = mergeDuplicateProducts(lineRows);
  const revenueTotal = round2(products.reduce((s, p) => s + p.revenue, 0));

  const reconciliation: Reconciliation = {
    rowsInFile: parsed.rowCount,
    rowsProcessed,
    rowsExcluded,
    ordersCounted: mapping.orderId ? orderIds.size : null,
    unitsCounted: round2(unitsCounted),
    revenueColumn: mapping.revenue,
    revenueMode: mapping.revenueMode,
    revenueTotal,
    excludedByStatus,
    quantityMismatches,
    expectedUnitsTotal: hasExpectedColumn ? round2(expectedUnitsTotal) : null,
    parsedUnitsTotal: round2(unitsCounted),
    columnMapping: mapping,
  };

  return { products, reconciliation, debugLines, previewLines };
}
