import { pool } from '../../config/db_pg';
import { logger } from '../../config/logger';
import type { AiInsightsPayload, ExtractionResult, ReportStatus } from './types';

/** Reports in these DB statuses longer than this are marked failed automatically. */
export const STALE_PROCESSING_MINUTES = 15;

export type ProcessingStep =
  | 'pending'
  | 'extracting'
  | 'calculating'
  | 'generating_insights'
  | 'awaiting_costs'
  | 'completed'
  | 'failed';

export type PublicReportStatus = 'pending' | 'processing' | 'completed' | 'failed';

const IN_FLIGHT_DB_STATUSES = ['extracting', 'processing', 'analyzing', 'generating_insights'] as const;

export function normalizePublicStatus(dbStatus: string): PublicReportStatus {
  if (dbStatus === 'completed') return 'completed';
  if (dbStatus === 'failed') return 'failed';
  if (dbStatus === 'uploaded') return 'pending';
  return 'processing';
}

export function getProcessingStep(
  extractionJson: ExtractionResult | Record<string, unknown> | null | undefined,
  dbStatus: string
): ProcessingStep {
  const meta = extractionJson as { processingStep?: ProcessingStep } | null | undefined;
  if (meta?.processingStep) return meta.processingStep;
  if (dbStatus === 'uploaded') return 'pending';
  if (dbStatus === 'needs_costs') return 'awaiting_costs';
  if (dbStatus === 'failed') return 'failed';
  if (dbStatus === 'completed') return 'completed';
  if (dbStatus === 'extracting') return 'extracting';
  return 'pending';
}

export function withProcessingStep(
  extraction: ExtractionResult | Record<string, unknown> | undefined,
  step: ProcessingStep
): ExtractionResult {
  const base = (extraction && typeof extraction === 'object' ? extraction : {}) as ExtractionResult;
  return { ...base, processingStep: step } as ExtractionResult;
}

export function wrapInsights(
  payload: AiInsightsPayload,
  status: 'ok' | 'failed' | 'skipped',
  error?: string
): AiInsightsPayload & { _meta: { status: string; error?: string } } {
  return {
    ...payload,
    _meta: { status, ...(error ? { error } : {}) },
  };
}

export function insightsStatusFromRow(aiInsights: unknown): 'ok' | 'failed' | 'pending' | null {
  if (!aiInsights || typeof aiInsights !== 'object') return null;
  const meta = (aiInsights as { _meta?: { status?: string } })._meta;
  if (meta?.status === 'failed') return 'failed';
  if (meta?.status === 'ok' || meta?.status === 'skipped') return meta.status === 'skipped' ? 'pending' : 'ok';
  return 'ok';
}

export async function recoverStaleReports(userId: number): Promise<number> {
  const r = await pool.query(
    `UPDATE analysis_reports
     SET status = 'failed',
         error_message = COALESCE(error_message, 'Processing timed out — please retry analysis'),
         updated_at = NOW()
     WHERE user_id = $1
       AND status = ANY($2::text[])
       AND updated_at < NOW() - ($3::text || ' minutes')::interval
     RETURNING id`,
    [userId, IN_FLIGHT_DB_STATUSES, String(STALE_PROCESSING_MINUTES)]
  );
  if (r.rowCount && r.rowCount > 0) {
    logger.warn('Cost analyzer recovered stale reports', { userId, count: r.rowCount, ids: r.rows.map((x) => x.id) });
  }
  return r.rowCount || 0;
}

export async function deleteReport(reportId: string, userId: number): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM analysis_reports WHERE id = $1 AND user_id = $2 RETURNING id',
    [reportId, userId]
  );
  return (r.rowCount || 0) > 0;
}

export async function resetReportForRetry(reportId: string, userId: number): Promise<ReportStatus | null> {
  const existing = await pool.query(
    'SELECT status, extraction_json IS NOT NULL AS has_extraction FROM analysis_reports WHERE id = $1 AND user_id = $2',
    [reportId, userId]
  );
  if (!existing.rows[0]) return null;
  const hasExtraction = Boolean(existing.rows[0].has_extraction);
  const nextStatus: ReportStatus = hasExtraction ? 'needs_costs' : 'uploaded';
  await pool.query(
    `UPDATE analysis_reports
     SET status = $3,
         error_message = NULL,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [reportId, userId, nextStatus]
  );
  return nextStatus;
}
