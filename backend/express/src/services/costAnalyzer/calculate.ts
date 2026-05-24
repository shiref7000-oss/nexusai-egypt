import type { ExtractedProduct, ReportItemRow, ReportTotals } from './types';

export function calculateReport(
  products: ExtractedProduct[],
  costMap: Map<string, number>,
  costOverrides?: Record<string, number>
): { items: ReportItemRow[]; totals: ReportTotals; missingCosts: string[] } {
  const missingCosts: string[] = [];
  const items: ReportItemRow[] = [];

  for (const p of products) {
    let unitCost = costOverrides?.[p.normalizedName];
    if (unitCost === undefined) unitCost = costMap.get(p.normalizedName);
    if (unitCost === undefined || unitCost === null || Number.isNaN(unitCost)) {
      missingCosts.push(p.productName);
      unitCost = 0;
    }
    const totalCost = round2(p.quantity * unitCost);
    const profit = round2(p.revenue - totalCost);
    const marginPct = p.revenue > 0 ? round4((profit / p.revenue) * 100) : null;

    items.push({
      ...p,
      unitCost: round4(unitCost),
      totalCost,
      profit,
      marginPct,
    });
  }

  items.sort((a, b) => b.profit - a.profit);

  const totalRevenue = round2(items.reduce((s, i) => s + i.revenue, 0));
  const totalProductCost = round2(items.reduce((s, i) => s + i.totalCost, 0));
  const grossProfit = round2(totalRevenue - totalProductCost);
  const grossMarginPct = totalRevenue > 0 ? round4((grossProfit / totalRevenue) * 100) : 0;
  const costPct = totalRevenue > 0 ? round4((totalProductCost / totalRevenue) * 100) : 0;
  const totalUnits = round2(items.reduce((s, i) => s + i.quantity, 0));

  const totals: ReportTotals = {
    totalRevenue,
    totalProductCost,
    grossProfit,
    grossMarginPct,
    costPct,
    totalUnits,
    totalOrders: null, // set by caller from reconciliation when available
  };

  return { items, totals, missingCosts: [...new Set(missingCosts)] };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
