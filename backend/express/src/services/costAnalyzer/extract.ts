import { processAIRequest } from '../ai';
import { logger } from '../../config/logger';
import { detectColumns, mergeMapping } from './columnDetect';
import { extractFromRows } from './rowExtract';
import type { ParsedSheet } from './spreadsheet';
import type { ColumnMappingConfig, ExtractionResult } from './types';

const MAPPING_SYSTEM = `You are a financial data analyst for eCommerce closing sheets.
Analyze spreadsheet headers and sample rows. Return ONLY valid JSON (no markdown):
{
  "currency": "EGP",
  "columnMapping": {
    "product": "exact header name for product",
    "quantity": "header name or null",
    "revenue": "header for collected amount or line total",
    "revenueMode": "collected" | "line_total" | "unit_price_x_qty",
    "unitPrice": "header or null",
    "orderId": "header or null",
    "status": "header or null",
    "bundleMultiplier": "header or null"
  },
  "notes": "brief"
}
Rules:
- Pick the column that represents COD/collected/net paid amount for revenue when present (not unit price).
- quantity must be a numeric qty column, NOT row count or discount.
- product must be product name, NOT customer name.
- Do NOT aggregate rows — only identify columns.`;

export async function suggestColumnMappingWithAI(
  parsed: ParsedSheet,
  userId: number
): Promise<Partial<ColumnMappingConfig> | null> {
  const sampleJson = JSON.stringify({
    headers: parsed.headers,
    rows: parsed.sampleRows.slice(0, 30),
    totalRows: parsed.rowCount,
  });

  const aiRes = await processAIRequest({
    agent: 'finance',
    prompt: `Identify column mapping for this closing sheet:\n\n${sampleJson}`,
    systemPrompt: MAPPING_SYSTEM,
    context: {},
    userId,
    overrides: { jsonMode: true, plainText: false, structuredOutput: true, maxTokens: 1024, responseVerbosity: 'concise' },
  });

  let raw: Record<string, unknown> | null = null;
  if (aiRes.success && aiRes.structured) raw = aiRes.structured as Record<string, unknown>;
  else if (aiRes.success && aiRes.response) {
    try {
      raw = JSON.parse(aiRes.response.replace(/```json|```/g, '').trim());
    } catch {
      return null;
    }
  }
  if (!raw?.columnMapping) return null;

  const cm = raw.columnMapping as Record<string, unknown>;
  const detected = detectColumns(parsed).mapping;
  const product = String(cm.product || '').trim();
  const revenue = String(cm.revenue || '').trim();

  return {
    product: parsed.headers.includes(product) ? product : detected.product,
    quantity:
      cm.quantity && parsed.headers.includes(String(cm.quantity))
        ? String(cm.quantity)
        : detected.quantity,
    revenue: parsed.headers.includes(revenue) ? revenue : detected.revenue,
    revenueMode: (['collected', 'line_total', 'unit_price_x_qty'].includes(String(cm.revenueMode))
      ? cm.revenueMode
      : detected.revenueMode) as ColumnMappingConfig['revenueMode'],
    unitPrice:
      cm.unitPrice && parsed.headers.includes(String(cm.unitPrice))
        ? String(cm.unitPrice)
        : detected.unitPrice,
    orderId:
      cm.orderId && parsed.headers.includes(String(cm.orderId)) ? String(cm.orderId) : detected.orderId,
    status:
      cm.status && parsed.headers.includes(String(cm.status)) ? String(cm.status) : detected.status,
    bundleMultiplier:
      cm.bundleMultiplier && parsed.headers.includes(String(cm.bundleMultiplier))
        ? String(cm.bundleMultiplier)
        : detected.bundleMultiplier,
  };
}

export function extractWithMapping(
  parsed: ParsedSheet,
  mapping: ColumnMappingConfig,
  currency = 'EGP',
  notes?: string
): ExtractionResult {
  const { products, reconciliation, debugLines, previewLines } = extractFromRows(parsed, mapping);
  return {
    currency,
    products,
    columnMapping: mapping,
    reconciliation,
    debugLines: debugLines.slice(0, 800),
    previewLines: previewLines.slice(0, 200),
    notes,
  };
}

export async function extractProductsWithAI(
  parsed: ParsedSheet,
  userId: number,
  mappingOverride?: Partial<ColumnMappingConfig> | null,
  options?: { useAiMapping?: boolean }
): Promise<ExtractionResult> {
  const detected = detectColumns(parsed);
  let mapping = detected.mapping;

  if (options?.useAiMapping !== false) {
    try {
      const aiMap = await suggestColumnMappingWithAI(parsed, userId);
      if (aiMap) mapping = mergeMapping(mapping, aiMap);
    } catch (err: unknown) {
      logger.warn('AI column mapping failed, using heuristics', {
        userId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  if (mappingOverride) mapping = mergeMapping(mapping, mappingOverride);

  const notes = mappingOverride
    ? 'Extracted using your column mapping.'
    : 'Extracted using detected columns on all spreadsheet rows.';

  return extractWithMapping(parsed, mapping, 'EGP', notes);
}

export function buildPreview(
  parsed: ParsedSheet,
  mappingOverride?: Partial<ColumnMappingConfig> | null
) {
  const detected = detectColumns(parsed);
  const mapping = mergeMapping(detected.mapping, mappingOverride);
  const result = extractWithMapping(parsed, mapping, 'EGP', 'Preview — no AI quota used.');
  return {
    headers: parsed.headers,
    sampleRows: parsed.sampleRows.slice(0, 15),
    candidates: detected.candidates,
    detectedStatuses: detected.detectedStatuses,
    mapping,
    reconciliation: result.reconciliation,
    previewProducts: result.products.slice(0, 30),
    parsedLines: (result.previewLines || []).slice(0, 50),
    revenueModeLabels: {
      collected: 'Collected / COD amount (as-is per row)',
      line_total: 'Line or order total (as-is per row)',
      unit_price_x_qty: 'Unit price × quantity × bundle multiplier',
    },
  };
}
