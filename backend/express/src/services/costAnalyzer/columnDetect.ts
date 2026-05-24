import type { ParsedSheet } from './spreadsheet';
import type { ColumnCandidate, ColumnDetectionResult, ColumnMappingConfig, RevenueMode } from './types';

type HeaderScore = { header: string; score: number; reason: string };

function norm(h: string) {
  return h.toLowerCase().trim();
}

function hasWord(h: string, words: string[]) {
  const n = norm(h);
  return words.some((w) => {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(n) || n.includes(w);
  });
}

function hasAny(h: string, substrings: string[]) {
  const n = norm(h);
  return substrings.some((s) => n.includes(s));
}

function penalize(h: string, bad: string[]) {
  return hasAny(h, bad) ? -40 : 0;
}

function scoreHeaders(headers: string[], scorer: (h: string) => HeaderScore): ColumnCandidate[] {
  return headers
    .map(scorer)
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function scoreProduct(h: string): HeaderScore {
  let score = 0;
  let reason = '';
  if (
    hasAny(h, [
      'shipment description',
      'order description',
      'item description',
      'product description',
      'وصف الشحنة',
      'وصف الطلب',
      'بيان الشحنة',
      'بيان المنتج',
      'الوصف',
      'وصف المنتج',
    ])
  ) {
    score = 98;
    reason = 'Shipment / order description (qty parsed from text)';
  } else if (hasAny(h, ['product name', 'item name', 'product title', 'اسم المنتج', 'المنتج', 'صنف', 'sku name'])) {
    score = 95;
    reason = 'Product name column';
  } else if (hasWord(h, ['product', 'item', 'sku', 'description', 'variant'])) {
    score = 75;
    reason = 'Product/item column';
  } else if (hasAny(h, ['منتج', 'صنف'])) {
    score = 80;
    reason = 'Arabic product column';
  }
  score += penalize(h, [
    'customer',
    'client',
    'buyer',
    'phone',
    'mobile',
    'email',
    'address',
    'city',
    'governorate',
    'date',
    'time',
    'tracking',
    'discount',
    'coupon',
    'عميل',
    'هاتف',
    'عنوان',
  ]);
  if (hasWord(h, ['name']) && !hasAny(h, ['product', 'item', 'sku', 'منتج'])) {
    score -= 25;
    reason = reason || 'Generic name (may be customer)';
  }
  return { header: h, score: Math.max(0, score), reason: reason || 'Possible product column' };
}

function scoreQuantity(h: string): HeaderScore {
  let score = 0;
  let reason = '';
  if (hasWord(h, ['qty', 'quantity', 'units', 'pieces', 'pcs'])) {
    score = 90;
    reason = 'Quantity column';
  } else if (hasAny(h, ['كمية', 'الكمية', 'عدد القطع'])) {
    score = 88;
    reason = 'Arabic quantity column';
  }
  score += penalize(h, ['discount', 'count orders', 'order count', 'row count', 'line count', 'خصم']);
  if (hasWord(h, ['count']) && !hasWord(h, ['account'])) {
    score -= 30;
    reason = 'Ambiguous "count" column';
  }
  return { header: h, score: Math.max(0, score), reason: reason || 'Possible quantity' };
}

function scoreRevenue(h: string): HeaderScore {
  let score = 0;
  let reason = '';
  if (
    hasAny(h, [
      'collected',
      'collection',
      'cod amount',
      'amount collected',
      'paid',
      'net collected',
      'cash collected',
      'تحصيل',
      'المحصل',
      'المبلغ المحصل',
      'تم التحصيل',
    ])
  ) {
    score = 98;
    reason = 'Collected / COD amount';
  } else if (hasAny(h, ['revenue', 'sales', 'subtotal', 'line total', 'order total', 'total amount', 'amount', 'إيراد', 'مبيعات', 'الإجمالي'])) {
    score = 72;
    reason = 'Line or order total';
  } else if (hasWord(h, ['total']) && !hasAny(h, ['cost', 'discount', 'shipping'])) {
    score = 65;
    reason = 'Total amount column';
  } else if (hasAny(h, ['price', 'unit price', 'سعر', 'سعر الوحدة'])) {
    score = 45;
    reason = 'Unit price (needs quantity × price)';
  }
  score += penalize(h, ['discount', 'shipping cost', 'cost price', 'unit cost', 'cogs', 'خصم', 'تكلفة']);
  return { header: h, score: Math.max(0, score), reason: reason || 'Possible revenue' };
}

function scoreUnitPrice(h: string): HeaderScore {
  let score = 0;
  if (hasAny(h, ['unit price', 'price per', 'سعر الوحدة', 'سعر القطعة']) || (hasWord(h, ['price']) && !hasAny(h, ['total', 'collected', 'cost']))) {
    score = 85;
  }
  return { header: h, score, reason: 'Unit price column' };
}

function scoreStatus(h: string): HeaderScore {
  let score = 0;
  if (hasAny(h, ['order status', 'delivery status', 'fulfillment', 'shipment status', 'حالة الطلب', 'حالة التوصيل', 'الحالة'])) {
    score = 92;
  } else if (hasWord(h, ['status', 'state'])) {
    score = 70;
  }
  return { header: h, score, reason: 'Order status column' };
}

function scoreOrderId(h: string): HeaderScore {
  let score = 0;
  if (hasAny(h, ['order id', 'order number', 'order no', 'order #', 'رقم الطلب', 'رقم الاوردر'])) {
    score = 90;
  } else if (hasWord(h, ['order']) && hasAny(h, ['id', 'no', 'number', '#'])) {
    score = 75;
  }
  return { header: h, score, reason: 'Order identifier' };
}

function scoreBundle(h: string): HeaderScore {
  let score = 0;
  if (hasAny(h, ['bundle', 'pack size', 'multiplier', 'عدد العبوة', 'حجم العبوة', 'قطع في العبوة'])) {
    score = 80;
  }
  return { header: h, score, reason: 'Bundle / pack multiplier' };
}

function scoreShippedCount(h: string): HeaderScore {
  let score = 0;
  if (hasAny(h, ['item count', 'pieces count', 'total items', 'total pieces', 'shipped qty', 'عدد القطع', 'عدد المنتجات', 'قطع الشحنة'])) {
    score = 88;
    return { header: h, score, reason: 'Expected shipped item count (reconciliation)' };
  }
  if (hasAny(h, ['items', 'pieces', 'units']) && !hasAny(h, ['price', 'cost', 'name', 'description'])) {
    score = 55;
    return { header: h, score, reason: 'Possible shipped count' };
  }
  return { header: h, score, reason: 'Shipped count column' };
}

function inferRevenueMode(revenueHeader: string, hasQty: boolean, unitPriceHeader: string | null): RevenueMode {
  const n = norm(revenueHeader);
  if (
    hasAny(revenueHeader, ['collected', 'collection', 'cod', 'paid', 'net collected', 'تحصيل', 'محصل'])
  ) {
    return 'collected';
  }
  if (unitPriceHeader && hasQty && hasAny(revenueHeader, ['price', 'سعر']) && !hasAny(revenueHeader, ['total', 'subtotal', 'amount'])) {
    return 'unit_price_x_qty';
  }
  if (hasQty && unitPriceHeader && !hasAny(revenueHeader, ['total', 'subtotal', 'collected', 'amount', 'revenue', 'sales'])) {
    return 'unit_price_x_qty';
  }
  return 'line_total';
}

export function detectColumns(parsed: ParsedSheet): ColumnDetectionResult {
  const headers = parsed.headers;

  const productCandidates = scoreHeaders(headers, scoreProduct);
  const quantityCandidates = scoreHeaders(headers, scoreQuantity);
  const revenueCandidates = scoreHeaders(headers, scoreRevenue);
  const statusCandidates = scoreHeaders(headers, scoreStatus);
  const orderIdCandidates = scoreHeaders(headers, scoreOrderId);
  const bundleCandidates = scoreHeaders(headers, scoreBundle);
  const shippedCountCandidates = scoreHeaders(headers, scoreShippedCount);
  const unitPriceCandidates = scoreHeaders(headers, scoreUnitPrice);

  const product = productCandidates[0]?.header || headers[0] || '';
  const quantity = quantityCandidates[0]?.score >= 50 ? quantityCandidates[0].header : null;
  const revenue = revenueCandidates[0]?.header || headers.find((h) => h !== product) || product;
  const unitPrice =
    unitPriceCandidates[0]?.score >= 50 ? unitPriceCandidates[0].header : null;
  const revenueMode = inferRevenueMode(revenue, !!quantity, unitPrice);

  const mapping: ColumnMappingConfig = {
    product,
    quantity,
    revenue,
    revenueMode,
    unitPrice: revenueMode === 'unit_price_x_qty' ? unitPrice || revenue : unitPrice,
    orderId: orderIdCandidates[0]?.score >= 50 ? orderIdCandidates[0].header : null,
    status: statusCandidates[0]?.score >= 50 ? statusCandidates[0].header : null,
    bundleMultiplier: bundleCandidates[0]?.score >= 50 ? bundleCandidates[0].header : null,
    shippedItemCount:
      shippedCountCandidates[0]?.score >= 50 ? shippedCountCandidates[0].header : null,
    orderFilters: {
      excludeCancelled: true,
      excludeReturned: true,
      includeOnlyStatuses: [],
    },
  };

  const detectedStatuses = collectUniqueStatuses(parsed, mapping.status);

  return {
    mapping,
    candidates: {
      product: productCandidates,
      quantity: quantityCandidates,
      revenue: revenueCandidates,
      status: statusCandidates,
      orderId: orderIdCandidates,
      bundleMultiplier: bundleCandidates,
      unitPrice: unitPriceCandidates,
    },
    detectedStatuses,
  };
}

export function collectUniqueStatuses(parsed: ParsedSheet, statusCol: string | null): string[] {
  if (!statusCol) return [];
  const set = new Set<string>();
  for (const row of parsed.rows) {
    const v = String(row[statusCol] ?? '').trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort().slice(0, 40);
}

export function mergeMapping(
  detected: ColumnMappingConfig,
  override?: Partial<ColumnMappingConfig> | null
): ColumnMappingConfig {
  if (!override) return detected;
  return {
    ...detected,
    ...override,
    orderFilters: {
      ...detected.orderFilters,
      ...(override.orderFilters || {}),
    },
  };
}
