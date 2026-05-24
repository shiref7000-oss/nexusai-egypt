import { normalizeProductName } from './normalize';
import { applyProductAlias } from './productAliases';

export type QuantitySource =
  | 'leading_count'
  | 'suffix_multiplier'
  | 'qty_label'
  | 'count_label'
  | 'column_override'
  | 'bundle_default'
  | 'explicit_none';

export type ParsedDescriptionItem = {
  productName: string;
  normalizedName: string;
  quantity: number;
  confidence: number;
  ambiguous: boolean;
  quantitySource: QuantitySource;
};

const BUNDLE_SEPARATORS = /\s*(?:\+|,|،|\band\b|\&|\/|\bو\b|\bwith\b)\s*/i;

/** Eastern Arabic numerals → ASCII */
function normalizeDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function cleanProductName(name: string): string {
  return applyProductAlias(
    name
      .replace(/^\d+\s*(?:x|×|\*)?\s*/i, '')
      .replace(/\s*(?:x|×|\*)\s*\d+\s*$/i, '')
      .replace(/(?:qty|quantity|عدد|العدد|كمية)\s*[:.]?\s*\d+/gi, '')
      .replace(/\d+\s*(?:منتج|قطعة|قطع|وحدة|pcs|pieces|units)\b/gi, '')
      .trim()
  );
}

function countStandaloneNumbers(text: string): number {
  const normalized = normalizeDigits(text);
  const matches = normalized.match(/\d+/g);
  return matches ? matches.length : 0;
}

function parseSegment(segment: string, segmentIndex: number, totalSegments: number): Omit<ParsedDescriptionItem, 'normalizedName'> {
  const raw = normalizeDigits(segment.trim());
  if (!raw) {
    return {
      productName: '',
      quantity: 0,
      confidence: 0,
      ambiguous: true,
      quantitySource: 'explicit_none',
    };
  }

  let ambiguous = countStandaloneNumbers(raw) > 1;

  // Suffix: product × 3 / x3
  const suffix = raw.match(/^(.+?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*$/i);
  if (suffix) {
    return {
      productName: cleanProductName(suffix[1]),
      quantity: parseFloat(suffix[2]),
      confidence: 0.96,
      ambiguous: false,
      quantitySource: 'suffix_multiplier',
    };
  }

  // Prefix multiplier: x3 product / ×3 product
  const prefixX = raw.match(/^(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (prefixX) {
    return {
      productName: cleanProductName(prefixX[2]),
      quantity: parseFloat(prefixX[1]),
      confidence: 0.94,
      ambiguous: false,
      quantitySource: 'suffix_multiplier',
    };
  }

  // Leading count: 2 منفضة / 2x منفضة / 2 منتج
  const leading = raw.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|\*)?\s*(.+)$/);
  if (leading) {
    const rest = leading[2].trim();
    if (!/^(?:منتج|قطعة|قطع|وحدة|pcs|pieces|units)\b/i.test(rest)) {
      return {
        productName: cleanProductName(rest),
        quantity: parseFloat(leading[1]),
        confidence: 0.93,
        ambiguous: false,
        quantitySource: 'leading_count',
      };
    }
  }

  // qty 2 / quantity: 2 / عدد 2 / كمية 2
  const qtyLabel = raw.match(/(?:qty|quantity|كمية|الكمية|عدد|العدد)\s*[:.]?\s*(\d+(?:\.\d+)?)/i);
  if (qtyLabel) {
    const name = cleanProductName(raw.replace(qtyLabel[0], ''));
    return {
      productName: name || cleanProductName(raw),
      quantity: parseFloat(qtyLabel[1]),
      confidence: 0.9,
      ambiguous,
      quantitySource: 'qty_label',
    };
  }

  // 2 pcs / 2 قطعة / 2 منتج at end
  const countEnd = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:منتج|قطعة|قطع|وحدة|pcs|pieces|units)\s*$/i);
  if (countEnd) {
    return {
      productName: cleanProductName(countEnd[1]),
      quantity: parseFloat(countEnd[2]),
      confidence: 0.88,
      ambiguous: false,
      quantitySource: 'count_label',
    };
  }

  const countStart = raw.match(/^(\d+(?:\.\d+)?)\s*(?:منتج|قطعة|قطع|وحدة|pcs|pieces|units)\s+(.+)$/i);
  if (countStart) {
    return {
      productName: cleanProductName(countStart[2]),
      quantity: parseFloat(countStart[1]),
      confidence: 0.88,
      ambiguous: false,
      quantitySource: 'count_label',
    };
  }

  // No explicit qty in this segment — bundle line item defaults to 1
  const name = cleanProductName(raw);
  const inMultiBundle = totalSegments > 1;
  return {
    productName: name,
    quantity: 1,
    confidence: inMultiBundle ? 0.82 : 0.55,
    ambiguous: ambiguous || (!inMultiBundle && countStandaloneNumbers(raw) === 0),
    quantitySource: inMultiBundle ? 'bundle_default' : 'bundle_default',
  };
}

/**
 * Parse shipment/order description into one or more products with quantities.
 */
export function parseShipmentDescription(description: string): ParsedDescriptionItem[] {
  const text = String(description || '').trim();
  if (!text) return [];

  const segments = text
    .split(BUNDLE_SEPARATORS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const parts = segments.length > 0 ? segments : [text];
  const out: ParsedDescriptionItem[] = [];

  for (let i = 0; i < parts.length; i++) {
    const parsed = parseSegment(parts[i], i, parts.length);
    if (!parsed.productName) continue;
    out.push({
      ...parsed,
      normalizedName: normalizeProductName(parsed.productName),
    });
  }

  return out;
}

/** True when text likely contains per-product quantity markers */
export function descriptionHasExplicitQuantity(description: string): boolean {
  const t = normalizeDigits(description);
  if (/(?:x|×|\*)\s*\d+/i.test(t)) return true;
  if (/^\d+\s+\S/.test(t)) return true;
  if (/(?:qty|quantity|عدد|العدد|كمية)\s*[:.]?\s*\d+/i.test(t)) return true;
  if (/\d+\s*(?:منتج|قطعة|قطع|pcs|pieces|units)/i.test(t)) return true;
  return false;
}

export function looksLikeShipmentDescription(description: string): boolean {
  const t = description.trim();
  if (t.length < 3) return false;
  if (BUNDLE_SEPARATORS.test(t)) return true;
  if (/(?:x|×|\*)\s*\d+/i.test(t)) return true;
  if (/^\d+\s+\S/.test(t)) return true;
  if (/(?:qty|quantity|عدد|كمية)/i.test(t)) return true;
  return false;
}
