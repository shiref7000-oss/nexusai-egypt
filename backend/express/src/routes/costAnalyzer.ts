import { Router } from 'express';
import multer from 'multer';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../config/logger';
import { paramStr } from '../utils/httpParam';
import { parseSpreadsheetBuffer, validateUploadFile } from '../services/costAnalyzer/spreadsheet';
import { buildPreview, extractProductsWithAI, extractWithMapping } from '../services/costAnalyzer/extract';
import { detectColumns, mergeMapping } from '../services/costAnalyzer/columnDetect';
import { generateInsightsWithTimeout } from '../services/costAnalyzer/insights';
import { rawSampleToParsed } from '../services/costAnalyzer/parseReport';
import { exportDebugCsv } from '../services/costAnalyzer/debugExport';
import type { ColumnMappingConfig } from '../services/costAnalyzer/types';
import {
  assertCostAnalyzerQuota,
  CostAnalyzerQuotaError,
  getCostAnalyzerUsage,
  incrementCostAnalyzerUsage,
} from '../services/costAnalyzer/usage';
import {
  createReport,
  getProductCostsMap,
  getReport,
  getReportItems,
  listProductCosts,
  listReports,
  replaceReportItems,
  updateReportStatus,
  upsertProductCost,
} from '../services/costAnalyzer/db';
import { calculateReport } from '../services/costAnalyzer/calculate';
import { exportCsv, exportPdf, exportXlsx } from '../services/costAnalyzer/export';
import { normalizeProductName } from '../services/costAnalyzer/normalize';
import type { ReportItemRow } from '../services/costAnalyzer/types';
import {
  resolveWorkspaceUserId,
  sendWorkspaceDebug,
  wantsWorkspaceDebug,
} from '../utils/workspaceContext';
import {
  deleteReport,
  getProcessingStep,
  insightsStatusFromRow,
  normalizePublicStatus,
  recoverStaleReports,
  resetReportForRetry,
  withProcessingStep,
  wrapInsights,
} from '../services/costAnalyzer/reportLifecycle';
import type { AiInsightsPayload, ExtractionResult } from '../services/costAnalyzer/types';
import { heuristicInsights } from '../services/costAnalyzer/insights';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

async function workspaceUserId(req: AuthenticatedRequest, res: import('express').Response) {
  const resolved = await resolveWorkspaceUserId(req);
  if (wantsWorkspaceDebug(req)) sendWorkspaceDebug(res, resolved.context);
  if (!resolved.userId) {
    res.status(resolved.status || 400).json({
      success: false,
      error: resolved.error || 'Account not linked',
      ...(wantsWorkspaceDebug(req) ? { debug: resolved.context } : {}),
    });
    return null;
  }
  return resolved.userId;
}

function mapReportRow(row: Record<string, unknown>, items?: ReportItemRow[]) {
  const dbStatus = String(row.status || 'uploaded');
  const extraction = row.extraction_json as ExtractionResult | undefined;
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileType: row.file_type,
    status: dbStatus,
    publicStatus: normalizePublicStatus(dbStatus),
    processingStep: getProcessingStep(extraction, dbStatus),
    insightsStatus: insightsStatusFromRow(row.ai_insights),
    currency: row.currency,
    totals: {
      totalRevenue: Number(row.total_revenue ?? 0),
      totalProductCost: Number(row.total_product_cost ?? 0),
      grossProfit: Number(row.gross_profit ?? 0),
      grossMarginPct: Number(row.gross_margin_pct ?? 0),
      costPct: Number(row.cost_pct ?? 0),
      totalUnits: Number(row.total_units ?? 0),
      totalOrders: row.total_orders != null ? Number(row.total_orders) : null,
    },
    aiInsights: row.ai_insights,
    extraction: row.extraction_json ?? undefined,
    reconciliation:
      (row.extraction_json as { reconciliation?: unknown } | null)?.reconciliation ?? undefined,
    errorMessage: row.error_message,
    items: items?.map(mapItem) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(it: ReportItemRow | Record<string, unknown>): ReportItemRow {
  const r = it as Record<string, unknown>;
  return {
    productName: String(r.productName ?? r.product_name ?? ''),
    normalizedName: String(r.normalizedName ?? r.normalized_name ?? ''),
    quantity: Number(r.quantity ?? 0),
    revenue: Number(r.revenue ?? 0),
    unitCost: Number(r.unitCost ?? r.unit_cost ?? 0),
    totalCost: Number(r.totalCost ?? r.total_cost ?? 0),
    profit: Number(r.profit ?? 0),
    marginPct: r.marginPct != null ? Number(r.marginPct) : r.margin_pct != null ? Number(r.margin_pct) : null,
  };
}

router.use(authenticate);

router.get('/usage', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const usage = await getCostAnalyzerUsage(userId, req.user!.plan, req.user!.role);
  res.json({ success: true, data: usage });
});

router.get('/product-costs', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const rows = await listProductCosts(userId);
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      productName: r.product_name,
      normalizedName: r.normalized_name,
      sku: r.sku,
      costPerUnit: Number(r.cost_per_unit),
      currency: r.currency,
      lastUpdatedAt: r.last_updated_at,
    })),
  });
});

router.post('/product-costs', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const costs = Array.isArray(req.body.costs) ? req.body.costs : [req.body];
  const saved: unknown[] = [];
  for (const c of costs) {
    const productName = String(c.productName || '').trim();
    if (!productName) continue;
    const normalizedName = normalizeProductName(productName);
    const row = await upsertProductCost(userId, {
      productName,
      normalizedName,
      sku: c.sku,
      costPerUnit: Number(c.costPerUnit),
      currency: c.currency,
    });
    saved.push(row);
  }
  res.json({ success: true, data: { saved: saved.length } });
});

router.get('/reports', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  await recoverStaleReports(userId);
  const rows = await listReports(userId);
  res.json({
    success: true,
    data: rows.map((r) => mapReportRow(r as Record<string, unknown>)),
  });
});

router.get('/reports/:id', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  await recoverStaleReports(userId);
  const report = await getReport(id, userId);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
  const itemRows = await getReportItems(id);
  const items = itemRows.map((r) =>
    mapItem({
      productName: r.product_name,
      normalizedName: r.normalized_name,
      quantity: r.quantity,
      revenue: r.revenue,
      unitCost: r.unit_cost,
      totalCost: r.total_cost,
      profit: r.profit,
      marginPct: r.margin_pct,
    } as ReportItemRow)
  );
  const payload = mapReportRow(report as Record<string, unknown>, items) as Record<string, unknown>;

  if (report.status === 'needs_costs' && report.extraction_json) {
    const extraction = report.extraction_json as {
      products?: Array<Record<string, unknown>>;
      columnMapping?: ColumnMappingConfig;
      currency?: string;
    };
    let products: Array<{
      productName: string;
      normalizedName: string;
      quantity: number;
      revenue: number;
    }>;
    if (extraction.columnMapping && report.raw_sample) {
      const parsed = rawSampleToParsed(report.raw_sample as Parameters<typeof rawSampleToParsed>[0]);
      products = extractWithMapping(parsed, extraction.columnMapping, extraction.currency || 'EGP').products;
    } else if (extraction.products?.length) {
      products = extraction.products.map((p) => ({
        productName: String(p.productName || p.product_name),
        normalizedName: String(
          p.normalizedName || p.normalized_name || normalizeProductName(String(p.productName || p.product_name))
        ),
        quantity: Number(p.quantity ?? 0),
        revenue: Number(p.revenue ?? 0),
      }));
    } else {
      products = [];
    }
    const costMap = await getProductCostsMap(userId);
    const { items: draftItems, missingCosts } = calculateReport(products, costMap, {});
    payload.missingCosts = missingCosts;
    payload.draftProducts = draftItems;
  }

  res.json({ success: true, data: payload });
});

router.post('/reports/:id/preview', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  const report = await getReport(id, userId);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

  try {
    const parsed = rawSampleToParsed(report.raw_sample as Parameters<typeof rawSampleToParsed>[0]);
    const mappingOverride = req.body?.columnMapping as Partial<ColumnMappingConfig> | undefined;
    const preview = buildPreview(parsed, mappingOverride || null);
    res.json({ success: true, data: preview });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Preview failed';
    res.status(400).json({ success: false, error: msg });
  }
});

router.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  try {
    validateUploadFile(file);
    const ext = (file.originalname.split('.').pop() || 'csv').toLowerCase();
    const parsed = parseSpreadsheetBuffer(file.buffer, file.originalname);
    const report = await createReport(userId, {
      title: String(req.body.title || file.originalname),
      fileName: file.originalname,
      fileType: ext,
      rawSample: {
        headers: parsed.headers,
        rowCount: parsed.rowCount,
        rows: parsed.rows,
        sampleRows: parsed.sampleRows,
      },
      currency: String(req.body.currency || 'EGP'),
    });

    res.status(201).json({
      success: true,
      data: {
        reportId: report.id,
        fileName: file.originalname,
        rowCount: parsed.rowCount,
        headers: parsed.headers,
        status: 'uploaded',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    logger.warn('Cost analyzer upload failed', { userId, error: msg });
    res.status(400).json({ success: false, error: msg });
  }
});

router.post('/reports/:id/analyze', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  const report = await getReport(id, userId);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

  try {
    await assertCostAnalyzerQuota(userId, req.user!.plan, req.user!.role);
  } catch (err: unknown) {
    if (err instanceof CostAnalyzerQuotaError) {
      return res.status(429).json({ success: false, error: err.message, code: err.code });
    }
    throw err;
  }

  await updateReportStatus(id, userId, 'extracting', {
    extractionJson: withProcessingStep(
      (report.extraction_json as ExtractionResult) || undefined,
      'extracting'
    ),
    errorMessage: null,
  });

  try {
    const parsed = rawSampleToParsed(report.raw_sample as Parameters<typeof rawSampleToParsed>[0]);
    const mappingOverride = req.body?.columnMapping as Partial<ColumnMappingConfig> | undefined;
    const useAiMapping = req.body?.useAiMapping !== false;
    const hasConfirmedMapping =
      Boolean(mappingOverride?.product) && Boolean(mappingOverride?.revenue);

    let extraction;
    if (hasConfirmedMapping) {
      const mapping = mergeMapping(detectColumns(parsed).mapping, mappingOverride);
      extraction = extractWithMapping(
        parsed,
        mapping,
        String(report.currency || 'EGP'),
        'Extracted from confirmed column mapping (no AI column detection).'
      );
    } else {
      extraction = await extractProductsWithAI(parsed, userId, mappingOverride || null, {
        useAiMapping,
      });
    }
    await incrementCostAnalyzerUsage(userId);

    const costMap = await getProductCostsMap(userId);
    const overrides: Record<string, number> = {};
    if (req.body?.costOverrides && typeof req.body.costOverrides === 'object') {
      for (const [k, v] of Object.entries(req.body.costOverrides)) {
        overrides[normalizeProductName(k)] = Number(v);
      }
    }

    const { items, totals, missingCosts } = calculateReport(extraction.products, costMap, overrides);
    totals.totalOrders = extraction.reconciliation.ordersCounted;

    if (missingCosts.length > 0) {
      await updateReportStatus(id, userId, 'needs_costs', {
        extractionJson: withProcessingStep(extraction, 'awaiting_costs'),
        currency: extraction.currency,
      });
      return res.json({
        success: true,
        data: {
          status: 'needs_costs',
          reportId: id,
          extraction,
          columnMapping: extraction.columnMapping,
          reconciliation: extraction.reconciliation,
          products: items,
          missingCosts,
          usage: await getCostAnalyzerUsage(userId, req.user!.plan, req.user!.role),
        },
      });
    }

    await updateReportStatus(id, userId, 'extracting', {
      extractionJson: withProcessingStep(extraction, 'generating_insights'),
    });

    let insights: AiInsightsPayload;
    let insightsFailed = false;
    try {
      insights = await generateInsightsWithTimeout(items, totals, extraction.currency, userId);
    } catch (insightErr: unknown) {
      insightsFailed = true;
      const msg = insightErr instanceof Error ? insightErr.message : 'Insights generation failed';
      insights = heuristicInsights(items, totals, extraction.currency);
      (insights as AiInsightsPayload)._meta = { status: 'failed', error: msg };
    }
    const wrappedInsights = insightsFailed
      ? wrapInsights(insights, 'failed', (insights as AiInsightsPayload)._meta?.error)
      : wrapInsights(insights, 'ok');

    await replaceReportItems(id, items);
    await updateReportStatus(id, userId, 'completed', {
      extractionJson: withProcessingStep(extraction, 'completed'),
      totals,
      aiInsights: wrappedInsights,
      currency: extraction.currency,
      errorMessage: null,
    });

    const usage = await getCostAnalyzerUsage(userId, req.user!.plan, req.user!.role);
    res.json({
      success: true,
      data: {
        status: 'completed',
        extraction,
        columnMapping: extraction.columnMapping,
        reconciliation: extraction.reconciliation,
        report: mapReportRow(
          (await getReport(id, userId)) as Record<string, unknown>,
          items
        ),
        usage,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    logger.error('Cost analyzer analyze failed', { userId, reportId: id, error: msg });
    await updateReportStatus(id, userId, 'failed', {
      errorMessage: msg,
      extractionJson: withProcessingStep(
        (report.extraction_json as ExtractionResult) || undefined,
        'failed'
      ),
    });
    res.status(500).json({ success: false, error: msg });
  }
});

router.delete('/reports/:id', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  const deleted = await deleteReport(id, userId);
  if (!deleted) return res.status(404).json({ success: false, error: 'Report not found' });
  res.json({ success: true, data: { deleted: true, reportId: id } });
});

router.post('/reports/:id/retry', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  await recoverStaleReports(userId);
  const nextStatus = await resetReportForRetry(id, userId);
  if (!nextStatus) return res.status(404).json({ success: false, error: 'Report not found' });
  const report = await getReport(id, userId);
  res.json({
    success: true,
    data: mapReportRow(report as Record<string, unknown>),
  });
});

router.post('/reports/:id/calculate', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  const report = await getReport(id, userId);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

  await updateReportStatus(id, userId, 'extracting', {
    extractionJson: withProcessingStep(
      (report.extraction_json as ExtractionResult) || undefined,
      'calculating'
    ),
    errorMessage: null,
  });

  try {
  const extraction = report.extraction_json as {
    products?: Array<Record<string, unknown>>;
    columnMapping?: ColumnMappingConfig;
    currency?: string;
  };
  let products: Array<{
    productName: string;
    normalizedName: string;
    quantity: number;
    revenue: number;
  }>;

  if (extraction?.columnMapping && report.raw_sample) {
    const parsed = rawSampleToParsed(report.raw_sample as Parameters<typeof rawSampleToParsed>[0]);
    const re = extractWithMapping(parsed, extraction.columnMapping, extraction.currency || 'EGP');
    products = re.products;
  } else if (extraction?.products?.length) {
    products = extraction.products.map((p) => ({
      productName: String(p.productName || p.product_name),
      normalizedName: String(
        p.normalizedName || p.normalized_name || normalizeProductName(String(p.productName || p.product_name))
      ),
      quantity: Number(p.quantity ?? 0),
      revenue: Number(p.revenue ?? 0),
    }));
  } else {
    return res.status(400).json({ success: false, error: 'Run extraction first' });
  }

  if (req.body?.saveCosts && Array.isArray(req.body.saveCosts)) {
    for (const c of req.body.saveCosts) {
      const productName = String(c.productName || '').trim();
      if (!productName) continue;
      await upsertProductCost(userId, {
        productName,
        normalizedName: normalizeProductName(productName),
        costPerUnit: Number(c.costPerUnit),
        currency: extraction.currency || 'EGP',
      });
    }
  }

  const costMap = await getProductCostsMap(userId);
  const overrides: Record<string, number> = {};
  if (req.body?.costOverrides) {
    for (const [k, v] of Object.entries(req.body.costOverrides)) {
      overrides[normalizeProductName(k)] = Number(v);
    }
  }

  const { items, totals, missingCosts } = calculateReport(products, costMap, overrides);
  if (missingCosts.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing unit costs for some products',
      data: { missingCosts, products: items },
    });
  }

  const currency = extraction.currency || report.currency || 'EGP';
  if (extraction.columnMapping && report.raw_sample) {
    const parsed = rawSampleToParsed(report.raw_sample as Parameters<typeof rawSampleToParsed>[0]);
    const re = extractWithMapping(parsed, extraction.columnMapping, currency);
    totals.totalOrders = re.reconciliation.ordersCounted;
  }

  let insights: AiInsightsPayload;
  let insightsFailed = false;
  try {
    insights = await generateInsightsWithTimeout(items, totals, currency, userId);
  } catch (insightErr: unknown) {
    insightsFailed = true;
    const msg = insightErr instanceof Error ? insightErr.message : 'Insights generation failed';
    insights = heuristicInsights(items, totals, currency);
    insights._meta = { status: 'failed', error: msg };
  }
  const wrappedInsights = insightsFailed
    ? wrapInsights(insights, 'failed', insights._meta?.error)
    : wrapInsights(insights, 'ok');

  await replaceReportItems(id, items);
  await updateReportStatus(id, userId, 'completed', {
    totals,
    aiInsights: wrappedInsights,
    extractionJson: withProcessingStep(extraction as ExtractionResult, 'completed'),
  });

  res.json({
    success: true,
    data: mapReportRow((await getReport(id, userId)) as Record<string, unknown>, items),
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Calculation failed';
    logger.error('Cost analyzer calculate failed', { userId, reportId: id, error: msg });
    await updateReportStatus(id, userId, 'failed', {
      errorMessage: msg,
      extractionJson: withProcessingStep(
        (report.extraction_json as ExtractionResult) || undefined,
        'failed'
      ),
    });
    res.status(500).json({ success: false, error: msg });
  }
});

router.get('/reports/:id/export', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const id = paramStr(req.params.id);
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const report = await getReport(id, userId);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

  const itemRows = await getReportItems(id);
  const items = itemRows.map((r) =>
    mapItem({
      productName: r.product_name,
      normalizedName: r.normalized_name,
      quantity: r.quantity,
      revenue: r.revenue,
      unitCost: r.unit_cost,
      totalCost: r.total_cost,
      profit: r.profit,
      marginPct: r.margin_pct,
    } as ReportItemRow)
  );

  const totals = {
    totalRevenue: Number(report.total_revenue ?? 0),
    totalProductCost: Number(report.total_product_cost ?? 0),
    grossProfit: Number(report.gross_profit ?? 0),
    grossMarginPct: Number(report.gross_margin_pct ?? 0),
    costPct: Number(report.cost_pct ?? 0),
    totalUnits: Number(report.total_units ?? 0),
    totalOrders: report.total_orders != null ? Number(report.total_orders) : null,
  };
  const currency = String(report.currency || 'EGP');
  const title = String(report.title || 'Cost Report');
  const insights = report.ai_insights as import('../services/costAnalyzer/types').AiInsightsPayload | null;

  const baseName = `cost-report-${id.slice(0, 8)}`;

  try {
    if (format === 'debug') {
      const ext = report.extraction_json as { debugLines?: import('../services/costAnalyzer/types').ParsedLineDebug[] };
      let lines = ext?.debugLines;
      if (!lines?.length && ext && (ext as { columnMapping?: ColumnMappingConfig }).columnMapping && report.raw_sample) {
        const parsed = rawSampleToParsed(report.raw_sample as Parameters<typeof rawSampleToParsed>[0]);
        lines = extractWithMapping(
          parsed,
          (ext as { columnMapping: ColumnMappingConfig }).columnMapping,
          String(report.currency || 'EGP')
        ).debugLines;
      }
      if (!lines?.length) {
        return res.status(400).json({ success: false, error: 'No debug data — run analysis first' });
      }
      const buf = exportDebugCsv(lines);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}-debug.csv"`);
      return res.send(buf);
    }
    if (format === 'csv') {
      const buf = exportCsv(items, totals, currency);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      return res.send(buf);
    }
    if (format === 'pdf') {
      const buf = await exportPdf(items, totals, currency, title, insights);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
      return res.send(buf);
    }
    const buf = exportXlsx(items, totals, currency, title);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
    return res.send(buf);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
