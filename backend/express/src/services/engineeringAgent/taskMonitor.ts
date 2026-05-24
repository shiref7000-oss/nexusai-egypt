import { pool } from '../../config/db_pg';
import type { EngineeringPhase } from './phases';
import { progressForPhase, phaseLabel } from './phases';
import { PIPELINE_PHASE_LABELS, type PipelinePhase } from './pipelinePhases';
import { deployStageLabel } from './deployStages';
import { appendTaskLog } from './db';
import { getEngineeringScorecard } from './engineeringScorecard';

export type ReasoningSummary = {
  planningSummary?: string;
  selectedFiles?: Array<{ path: string; reason: string }>;
  executionPlanSummary?: string;
  buildFixAttempts?: number;
  finalDecision?: string;
};

export async function setTaskPhase(
  taskId: string,
  userId: number,
  phase: EngineeringPhase,
  extra?: {
    status?: string;
    buildStatus?: string | null;
    filesReadCount?: number;
    filesWrittenCount?: number;
    reasoningSummary?: ReasoningSummary;
    progressPercent?: number;
  }
): Promise<void> {
  const progress = extra?.progressPercent ?? progressForPhase(phase);
  const sets = ['current_phase = $3', 'progress_percent = $4', 'updated_at = NOW()'];
  const params: unknown[] = [taskId, userId, phase, progress];

  if (extra?.status) {
    params.push(extra.status);
    sets.push(`status = $${params.length}`);
  }
  if (extra?.buildStatus !== undefined) {
    params.push(extra.buildStatus);
    sets.push(`build_status = $${params.length}`);
  }
  if (extra?.filesReadCount !== undefined) {
    params.push(extra.filesReadCount);
    sets.push(`files_read_count = $${params.length}`);
  }
  if (extra?.filesWrittenCount !== undefined) {
    params.push(extra.filesWrittenCount);
    sets.push(`files_written_count = $${params.length}`);
  }
  if (extra?.reasoningSummary !== undefined) {
    params.push(JSON.stringify(extra.reasoningSummary));
    sets.push(`reasoning_summary = $${params.length}::jsonb`);
  }

  await pool.query(`UPDATE agent_tasks SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`, params);

  await appendTaskLog(taskId, {
    eventType: 'phase_change',
    message: phase,
    payload: { phase, progress },
  });
}

const TASK_LIST_COLUMNS = `
  t.id, t.user_id, t.title, t.prompt, t.status, t.current_phase, t.progress_percent,
  t.started_at, t.updated_at, t.completed_at, t.files_read_count, t.files_written_count,
  t.files_touched, t.build_status, t.build_duration_ms, t.deploy_stage, t.task_type,
  t.execution_mode, t.verification_status, t.verification_summary, t.confidence_score,
  t.deployment_blocked, t.parent_task_id, t.reliability_json,
  t.pipeline_phase, t.pipeline_state, t.understanding_confidence, t.implementation_confidence,
  t.verification_confidence_pct,
  t.risk_score, t.risk_category, t.risk_report, t.risk_approval_status, t.agent_git_branch, t.rollback_available
`;

export async function listAllTasksAdmin(limit = 100, offset = 0) {
  const r = await pool.query(
    `SELECT ${TASK_LIST_COLUMNS}, u.email AS user_email
     FROM agent_tasks t
     LEFT JOIN users u ON u.id = t.user_id
     ORDER BY t.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return r.rows;
}

export async function getTaskAdmin(taskId: string) {
  const r = await pool.query(
    `SELECT t.*, u.email AS user_email, u.full_name AS user_name
     FROM agent_tasks t
     LEFT JOIN users u ON u.id = t.user_id
     WHERE t.id = $1`,
    [taskId]
  );
  return r.rows[0] || null;
}

/** Lightweight poll payload for task detail (no logs/messages). */
export async function getTaskAdminPollSnapshot(taskId: string) {
  const task = await getTaskAdmin(taskId);
  if (!task) return null;
  const overview = mapTaskListRow(task as Record<string, unknown>);
  return {
    overview: {
      ...overview,
      currentStep: task.pipeline_phase
        ? PIPELINE_PHASE_LABELS[task.pipeline_phase as PipelinePhase] ||
          String(task.pipeline_phase)
        : phaseLabel(String(task.current_phase || task.status)),
      pipelinePhase: task.pipeline_phase ?? null,
      pipelinePhaseLabel: task.pipeline_phase
        ? PIPELINE_PHASE_LABELS[task.pipeline_phase as PipelinePhase] || task.pipeline_phase
        : null,
      pipelineState: task.pipeline_state ?? null,
      understandingConfidence:
        task.understanding_confidence != null ? Number(task.understanding_confidence) : null,
      implementationConfidence:
        task.implementation_confidence != null ? Number(task.implementation_confidence) : null,
      verificationConfidencePct:
        task.verification_confidence_pct != null
          ? Number(task.verification_confidence_pct)
          : null,
      deployStageLabel: deployStageLabel(String(task.deploy_stage || '')),
      verificationStatus: task.verification_status,
      verificationSummary: task.verification_summary,
      errorMessage: task.error_message,
    },
    updatedAt: task.updated_at,
  };
}

export async function getEngineeringMetrics() {
  const scorecard = await getEngineeringScorecard().catch(() => null);
  const r = await pool.query(`
    SELECT
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE status IN ('pending','planning','running'))::int AS running_tasks,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_tasks,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_tasks,
      COUNT(*) FILTER (WHERE status = 'review')::int AS review_tasks,
      COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (
        WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
      ), 0)::int AS avg_completion_ms,
      COALESCE(SUM(files_written_count) FILTER (WHERE updated_at >= CURRENT_DATE), 0)::int AS files_modified_today,
      COUNT(*) FILTER (WHERE build_status = 'passed')::int AS builds_passed,
      COUNT(*) FILTER (WHERE build_status IN ('passed','failed'))::int AS builds_total
    FROM agent_tasks
  `);
  const row = r.rows[0] || {};
  const buildsTotal = Number(row.builds_total || 0);
  const buildsPassed = Number(row.builds_passed || 0);
  return {
    totalTasks: Number(row.total_tasks || 0),
    runningTasks: Number(row.running_tasks || 0),
    completedTasks: Number(row.completed_tasks || 0),
    failedTasks: Number(row.failed_tasks || 0),
    reviewTasks: Number(row.review_tasks || 0),
    avgCompletionMs: Number(row.avg_completion_ms || 0),
    filesModifiedToday: Number(row.files_modified_today || 0),
    buildSuccessRate: buildsTotal > 0 ? Math.round((buildsPassed / buildsTotal) * 1000) / 10 : null,
    scorecard,
  };
}

export function buildTimelineFromLogs(
  logs: Array<{ event_type: string; message: string | null; payload: unknown; created_at: Date }>
) {
  return logs.map((log) => ({
    id: log.event_type,
    label: timelineLabel(log),
    message: log.message,
    eventType: log.event_type,
    payload: log.payload,
    at: log.created_at,
  }));
}

function timelineLabel(log: { event_type: string; message: string | null; payload: unknown }): string {
  const p = log.payload as Record<string, unknown> | null;
  switch (log.event_type) {
    case 'phase_change':
      return `Phase: ${log.message || 'updated'}`;
    case 'tool_call': {
      const tool = p?.tool as string | undefined;
      if (tool === 'read_file') return `Read file: ${(p?.input as { path?: string })?.path || ''}`;
      if (tool === 'write_file' || tool === 'create_file')
        return `Modified file: ${(p?.input as { path?: string })?.path || ''}`;
      if (tool === 'search_code') return `Code search`;
      if (tool === 'run_terminal') return `Terminal: ${(p?.input as { command?: string })?.command || ''}`;
      return `Tool: ${tool || 'call'}`;
    }
    case 'plan':
      return 'Generated plan';
    case 'code_index':
      return 'Code index updated';
    case 'file_edit':
      return log.message || 'File edited';
    case 'build_error':
      return 'Build failed — retrying';
    case 'completed':
      return log.message || 'Task completed';
    case 'verification_mode':
      return 'Verification execution mode';
    case 'verification':
      return log.message || 'Verification step';
    case 'verification_completed':
      return log.message || 'Verification completed';
    case 'verification_incomplete':
      return log.message || 'Verification incomplete';
    case 'evidence_collection':
      return log.message || 'Evidence collected';
    case 'budget_exceeded':
    case 'budget_deferred':
      return log.message || 'Change budget';
    case 'approval_required':
      return log.message || 'Approval required';
    case 'task_decomposed':
      return log.message || 'Task decomposed';
    case 'regression_baseline':
      return log.message || 'Regression baseline';
    case 'session_created':
      return 'Task session created';
    case 'session_continue':
      return log.message || 'Session follow-up';
    case 'pipeline_phase':
      return `Pipeline: ${log.message || 'phase'}`;
    case 'impact_scope_warning':
    case 'scope_blocked':
      return log.message || 'Scope control';
    case 'risk_approval_required':
      return log.message || 'Risk approval required';
    case 'risk_approved':
      return log.message || 'Risk approved';
    case 'branch_isolation':
      return log.message || 'Git branch isolation';
    case 'incremental_delivery':
      return log.message || 'Incremental delivery';
    case 'error':
      return `Error: ${log.message || ''}`;
    default:
      return log.message || log.event_type;
  }
}

export function mapTaskListRow(row: Record<string, unknown>) {
  const started = row.started_at ? new Date(row.started_at as string).getTime() : null;
  const completed = row.completed_at ? new Date(row.completed_at as string).getTime() : null;
  const updated = new Date(row.updated_at as string).getTime();
  const durationMs =
    started != null
      ? (completed ?? updated) - started
      : null;

  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    currentPhase: row.current_phase || row.status,
    progressPercent: Number(row.progress_percent ?? 0),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    durationMs,
    filesReadCount: Number(row.files_read_count ?? 0),
    filesWrittenCount: Number(row.files_written_count ?? 0),
    filesModified: row.files_touched || [],
    buildStatus: row.build_status,
    buildDurationMs: row.build_duration_ms,
    deployStage: row.deploy_stage ?? null,
    taskType: row.task_type ?? 'implementation',
    executionMode: row.execution_mode ?? 'implementation',
    verificationStatus: row.verification_status ?? null,
    verificationSummary: row.verification_summary ?? null,
    confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
    deploymentBlocked: row.deployment_blocked === true,
    parentTaskId: row.parent_task_id ?? null,
    reliability: row.reliability_json ?? null,
    riskScore: row.risk_score != null ? Number(row.risk_score) : null,
    riskCategory: row.risk_category ?? null,
    riskReport: row.risk_report ?? null,
    riskApprovalStatus: row.risk_approval_status ?? 'not_required',
    agentGitBranch: row.agent_git_branch ?? null,
    rollbackAvailable: row.rollback_available === true,
    canDeploy:
      (row.execution_mode ?? 'implementation') === 'implementation' &&
      row.status === 'completed' &&
      row.build_status === 'passed' &&
      row.verification_status === 'passed' &&
      row.deploy_stage === 'ready_for_deploy' &&
      row.deployment_blocked !== true,
  };
}
