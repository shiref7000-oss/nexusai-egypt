import { processAIRequest } from '../ai';
import type { AiInsightsPayload, ReportItemRow, ReportTotals } from './types';

export function heuristicInsights(
  items: ReportItemRow[],
  totals: ReportTotals,
  currency: string
): AiInsightsPayload {
  const sortedProfit = [...items].sort((a, b) => b.profit - a.profit);
  const sortedQty = [...items].sort((a, b) => b.quantity - a.quantity);
  const sortedMargin = [...items].filter((i) => i.revenue > 0).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));

  return {
    executiveSummary: `Total revenue ${totals.totalRevenue} ${currency} with gross margin ${totals.grossMarginPct}% and product cost ${totals.costPct}% of revenue.`,
    bullets: [
      `Gross profit: ${totals.grossProfit} ${currency}`,
      `Top product by profit: ${sortedProfit[0]?.productName || 'N/A'}`,
      `Highest quantity sold: ${sortedQty[0]?.productName || 'N/A'}`,
    ],
    mostProfitable: sortedProfit[0]?.productName,
    lowestMargin: sortedMargin[0]?.productName,
    highestSelling: sortedQty[0]?.productName,
    repricingSuggestions: sortedMargin[0]
      ? [`Review pricing for ${sortedMargin[0].productName} — margin ${sortedMargin[0].marginPct}%`]
      : [],
  };
}

const INSIGHTS_AI_TIMEOUT_MS = 45000;

export async function generateInsights(
  items: ReportItemRow[],
  totals: ReportTotals,
  currency: string,
  userId: number
): Promise<AiInsightsPayload> {
  const top = items.slice(0, 15).map((i) => ({
    product: i.productName,
    qty: i.quantity,
    revenue: i.revenue,
    cost: i.totalCost,
    profit: i.profit,
    marginPct: i.marginPct,
  }));

  const aiRes = await processAIRequest({
    agent: 'finance',
    prompt: `Write executive insights for this monthly inventory cost analysis.\n\nTotals: ${JSON.stringify(totals)}\nTop products: ${JSON.stringify(top)}`,
    systemPrompt: `Return ONLY JSON:
{
  "executiveSummary": "2-3 sentences",
  "bullets": ["insight 1", "insight 2"],
  "mostProfitable": "product name",
  "lowestMargin": "product name",
  "highestSelling": "product name",
  "repricingSuggestions": ["suggestion"]
}
Be concise, actionable. Currency: ${currency}.`,
    context: {},
    userId,
    overrides: { jsonMode: true, plainText: false, structuredOutput: true, maxTokens: 1500, responseVerbosity: 'concise' },
  });

  if (aiRes.structured) {
    return aiRes.structured as AiInsightsPayload;
  }

  return heuristicInsights(items, totals, currency);
}

export async function generateInsightsWithTimeout(
  items: ReportItemRow[],
  totals: ReportTotals,
  currency: string,
  userId: number,
  timeoutMs = INSIGHTS_AI_TIMEOUT_MS
): Promise<AiInsightsPayload> {
  try {
    return await Promise.race([
      generateInsights(items, totals, currency, userId),
      new Promise<AiInsightsPayload>((_, reject) =>
        setTimeout(() => reject(new Error('Insights AI timeout')), timeoutMs)
      ),
    ]);
  } catch {
    return heuristicInsights(items, totals, currency);
  }
}
