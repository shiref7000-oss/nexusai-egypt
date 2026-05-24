import { applyProductAlias } from './productAliases';

export { applyProductAlias };

/** Normalize product names for grouping and cost library lookup. */
export function normalizeProductName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, '');
}

export function mergeDuplicateProducts(
  rows: Array<{ productName: string; quantity: number; revenue: number }>
): Array<{ productName: string; normalizedName: string; quantity: number; revenue: number }> {
  const map = new Map<string, { productName: string; quantity: number; revenue: number }>();

  for (const row of rows) {
    const productName = applyProductAlias(String(row.productName || '').trim());
    if (!productName) continue;
    const key = normalizeProductName(productName);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += Number(row.quantity) || 0;
      existing.revenue += Number(row.revenue) || 0;
      if (productName.length > existing.productName.length) {
        existing.productName = productName;
      }
    } else {
      map.set(key, {
        productName,
        quantity: Number(row.quantity) || 0,
        revenue: Number(row.revenue) || 0,
      });
    }
  }

  return Array.from(map.entries()).map(([normalizedName, v]) => ({
    ...v,
    normalizedName,
  }));
}
