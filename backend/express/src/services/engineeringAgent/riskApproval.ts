import { pool } from '../../config/db_pg';
import { appendTaskLog } from './db';
import type { RiskReport } from './riskEngine';
import { formatRiskReportMarkdown } from './riskEngine';
import { mergeReliabilityJson } from './reliabilityDb';

export async function persistRiskReport(
  taskId: string,
  report: RiskReport,
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'auto_approved'
): Promise<void> {
  await pool.query(
    `UPDATE agent_tasks SET
      risk_score = $2,
      risk_category = $3,
      risk_report = $4::jsonb,
      risk_approval_status = $5,
      rollback_available = $6,
      updated_at = NOW()
     WHERE id = $1`,
    [
      taskId,
      report.riskScore,
      report.riskCategory,
      JSON.stringify(report),
      approvalStatus,
      report.rollbackAvailable,
    ]
  );
  await mergeReliabilityJson(taskId, { riskReport: report, riskApprovalStatus: approvalStatus });
}

export async function requestRiskApproval(
  taskId: string,
  userId: number,
  report: RiskReport,
  planJson: unknown
): Promise<void> {
  await persistRiskReport(taskId, report, 'pending');
  const { updateTask } = await import('./db');
  const { setTaskPhase } = await import('./taskMonitor');
  await updateTask(taskId, userId, {
    status: 'review',
    planJson,
    resultReport: formatRiskReportMarkdown(report),
    errorMessage: null,
    completedAt: null,
  });
  await pool.query(
    `UPDATE agent_tasks SET reliability_json = COALESCE(reliability_json, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [
      taskId,
      JSON.stringify({
        resumeFrom: 'IMPLEMENTATION',
        riskApprovalPending: true,
      }),
    ]
  );
  await setTaskPhase(taskId, userId, 'review', {
    status: 'review',
    progressPercent: 45,
  });
  await appendTaskLog(taskId, {
    eventType: 'risk_approval_required',
    level: 'warn',
    message: `${report.riskCategory} risk (${report.riskScore}) — awaiting human approval`,
    payload: {
      riskCategory: report.riskCategory,
      riskScore: report.riskScore,
      reasons: report.reasons,
      safeExecutionMode: report.safeExecutionMode,
    },
  });
}

export async function approveRiskAndResume(
  taskId: string,
  approvedByUserId: number
): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query(`SELECT risk_approval_status, user_id FROM agent_tasks WHERE id = $1`, [
    taskId,
  ]);
  const row = r.rows[0];
  if (!row) return { ok: false, error: 'Task not found' };
  if (row.risk_approval_status !== 'pending') {
    return { ok: false, error: `Task is not awaiting approval (status: ${row.risk_approval_status})` };
  }

  await pool.query(
    `UPDATE agent_tasks SET risk_approval_status = 'approved', status = 'running',
     reliability_json = COALESCE(reliability_json, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [
      taskId,
      JSON.stringify({
        riskApproved: true,
        riskApprovedAt: new Date().toISOString(),
        riskApprovedBy: approvedByUserId,
        resumeFrom: 'IMPLEMENTATION',
      }),
    ]
  );
  await appendTaskLog(taskId, {
    eventType: 'risk_approved',
    message: 'Human approved HIGH/CRITICAL risk — resuming implementation',
    payload: { approvedBy: approvedByUserId },
  });
  return { ok: true };
}

export async function isRiskApprovedForResume(taskId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT risk_approval_status, reliability_json FROM agent_tasks WHERE id = $1`,
    [taskId]
  );
  const row = r.rows[0];
  if (!row) return false;
  if (row.risk_approval_status === 'approved' || row.risk_approval_status === 'auto_approved') {
    return true;
  }
  const rel = row.reliability_json as { resumeFrom?: string; riskApproved?: boolean } | null;
  return rel?.resumeFrom === 'IMPLEMENTATION' && rel?.riskApproved === true;
}
