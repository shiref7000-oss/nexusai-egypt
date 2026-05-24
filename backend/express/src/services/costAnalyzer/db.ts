import { pool } from '../../config/db_pg';
import type { AiInsightsPayload, ExtractionResult, ReportItemRow, ReportStatus, ReportTotals } from './types';

export async function listProductCosts(userId: number) {
  const r = await pool.query(
    `SELECT id, product_name, normalized_name, sku, cost_per_unit, currency, last_updated_at
     FROM product_costs WHERE user_id = $1 ORDER BY product_name`,
    [userId]
  );
  return r.rows;
}

export async function upsertProductCost(
  userId: number,
  input: { productName: string; normalizedName: string; sku?: string; costPerUnit: number; currency?: string }
) {
  const r = await pool.query(
    `INSERT INTO product_costs (user_id, product_name, normalized_name, sku, cost_per_unit, currency, last_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, normalized_name)
     DO UPDATE SET
       product_name = EXCLUDED.product_name,
       sku = COALESCE(EXCLUDED.sku, product_costs.sku),
       cost_per_unit = EXCLUDED.cost_per_unit,
       currency = EXCLUDED.currency,
       last_updated_at = NOW()
     RETURNING *`,
    [
      userId,
      input.productName,
      input.normalizedName,
      input.sku || null,
      input.costPerUnit,
      input.currency || 'EGP',
    ]
  );
  return r.rows[0];
}

export async function getProductCostsMap(userId: number): Promise<Map<string, number>> {
  const rows = await listProductCosts(userId);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.normalized_name as string, Number(row.cost_per_unit));
  }
  return map;
}

export async function createReport(
  userId: number,
  input: {
    title?: string;
    fileName: string;
    fileType: string;
    rawSample: unknown;
    currency?: string;
  }
) {
  const r = await pool.query(
    `INSERT INTO analysis_reports (
      user_id, title, file_name, file_type, status, currency, raw_sample
    ) VALUES ($1, $2, $3, $4, 'uploaded', $5, $6::jsonb)
    RETURNING *`,
    [
      userId,
      input.title || input.fileName,
      input.fileName,
      input.fileType,
      input.currency || 'EGP',
      JSON.stringify(input.rawSample),
    ]
  );
  return r.rows[0];
}

export async function updateReportStatus(
  reportId: string,
  userId: number,
  status: ReportStatus,
  patch?: {
    extractionJson?: ExtractionResult;
    errorMessage?: string | null;
    totals?: ReportTotals;
    aiInsights?: AiInsightsPayload;
    currency?: string;
  }
) {
  const sets = ['status = $3', 'updated_at = NOW()'];
  const params: unknown[] = [reportId, userId, status];
  if (patch?.extractionJson !== undefined) {
    params.push(JSON.stringify(patch.extractionJson));
    sets.push(`extraction_json = $${params.length}::jsonb`);
  }
  if (patch?.errorMessage !== undefined) {
    params.push(patch.errorMessage);
    sets.push(`error_message = $${params.length}`);
  }
  if (patch?.currency) {
    params.push(patch.currency);
    sets.push(`currency = $${params.length}`);
  }
  if (patch?.totals) {
    const t = patch.totals;
    params.push(
      t.totalRevenue,
      t.totalProductCost,
      t.grossProfit,
      t.grossMarginPct,
      t.costPct,
      t.totalUnits,
      t.totalOrders
    );
    const o = params.length - 6;
    sets.push(
      `total_revenue = $${o}`,
      `total_product_cost = $${o + 1}`,
      `gross_profit = $${o + 2}`,
      `gross_margin_pct = $${o + 3}`,
      `cost_pct = $${o + 4}`,
      `total_units = $${o + 5}`,
      `total_orders = $${o + 6}`
    );
  }
  if (patch?.aiInsights) {
    params.push(JSON.stringify(patch.aiInsights));
    sets.push(`ai_insights = $${params.length}::jsonb`);
  }
  const r = await pool.query(
    `UPDATE analysis_reports SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

export async function getReport(reportId: string, userId: number) {
  const r = await pool.query(
    'SELECT * FROM analysis_reports WHERE id = $1 AND user_id = $2',
    [reportId, userId]
  );
  return r.rows[0] || null;
}

export async function listReports(userId: number, limit = 50) {
  const r = await pool.query(
    `SELECT id, title, file_name, status, currency, total_revenue, gross_profit, gross_margin_pct,
            total_units, created_at, updated_at
     FROM analysis_reports WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

export async function replaceReportItems(reportId: string, items: ReportItemRow[]) {
  await pool.query('DELETE FROM analysis_report_items WHERE report_id = $1', [reportId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await pool.query(
      `INSERT INTO analysis_report_items (
        report_id, product_name, normalized_name, quantity, revenue, unit_cost,
        total_cost, profit, margin_pct, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        reportId,
        it.productName,
        it.normalizedName,
        it.quantity,
        it.revenue,
        it.unitCost,
        it.totalCost,
        it.profit,
        it.marginPct,
        i,
      ]
    );
  }
}

export async function getReportItems(reportId: string) {
  const r = await pool.query(
    `SELECT * FROM analysis_report_items WHERE report_id = $1 ORDER BY sort_order`,
    [reportId]
  );
  return r.rows;
}
