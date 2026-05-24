import { pool } from '../config/db_pg';
import { WORKFLOW_DEFINITIONS, WORKFLOW_NAME_TO_KEY, getWorkflowByKey } from '../config/workflows';
import {
  checkN8nHealth,
  listWorkflows,
  listExecutions,
  triggerWebhook,
  samplePayloadForWorkflow,
  type N8nWorkflowRow,
} from './n8n';
import { logger } from '../config/logger';

export type RuntimeWorkflowState =
  | 'online'
  | 'offline'
  | 'running'
  | 'paused'
  | 'failed';

export type WorkflowLogEntry = {
  id: number | string;
  source: 'n8n' | 'database' | 'queue';
  status: string;
  message: string;
  at: string;
  durationMs?: number | null;
  n8nExecutionId?: string | null;
};

export type WorkflowRuntimeStatus = {
  key: string;
  agent: string;
  name: string;
  webhookPath: string;
  n8nWorkflowId: string | null;
  state: RuntimeWorkflowState;
  n8nActive: boolean;
  lastExecutionId: string | null;
  n8nExecutionId: string | null;
  lastExecutionStatus: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  failureReason: string | null;
  lastDurationMs: number | null;
  executionCount: number;
  avgRuntimeMs: number | null;
  successCount: number;
  failedCount: number;
  queueWaiting: number;
  queueActive: number;
  recentLogs: WorkflowLogEntry[];
};

export type WorkflowExecutionRecord = {
  id: number;
  workflowKey: string;
  workflowName: string;
  n8nExecutionId: string | null;
  status: string;
  triggerSource: string | null;
  queueJobId: string | null;
  durationMs: number | null;
  failureReason: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  inputData: unknown;
  outputData: unknown;
};

export type WorkflowExecuteResult = {
  success: boolean;
  runId?: number;
  n8nExecutionId?: string | null;
  error?: string;
  failureReason?: string | null;
  output?: unknown;
  durationMs?: number;
  logs?: WorkflowLogEntry[];
};

function mapExecutionStatus(status: string | undefined): string {
  if (!status) return 'unknown';
  if (status === 'success') return 'completed';
  if (status === 'error') return 'failed';
  return status;
}

function resolveState(params: {
  n8nOnline: boolean;
  n8nWorkflow?: N8nWorkflowRow;
  lastExecStatus?: string | null;
  hasRunningExec: boolean;
  queueActiveForWf: boolean;
}): RuntimeWorkflowState {
  if (!params.n8nOnline) return 'offline';
  if (!params.n8nWorkflow) return 'offline';
  if (!params.n8nWorkflow.active) return 'paused';
  if (params.hasRunningExec || params.queueActiveForWf) return 'running';
  if (params.lastExecStatus === 'failed' || params.lastExecStatus === 'error') return 'failed';
  return 'online';
}

async function getQueueCounts(): Promise<{ waiting: number; active: number }> {
  try {
    const { workflowQueue } = await import('./queue');
    const [waiting, active] = await Promise.all([
      workflowQueue.getWaitingCount(),
      workflowQueue.getActiveCount(),
    ]);
    return { waiting, active };
  } catch {
    return { waiting: 0, active: 0 };
  }
}

type DbRunRow = {
  id: number;
  workflow_name: string;
  workflow_key: string | null;
  status: string;
  error_message: string | null;
  failure_reason: string | null;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  n8n_execution_id: string | null;
  trigger_source: string | null;
  queue_job_id: string | null;
  output_data: unknown;
  input_data: unknown;
};

async function getDbRuns(userId: number, limit = 100): Promise<DbRunRow[]> {
  const res = await pool.query(
    `SELECT id, workflow_name, workflow_key, status, error_message, failure_reason,
            started_at, completed_at, duration_ms, n8n_execution_id, trigger_source,
            queue_job_id, output_data, input_data
     FROM workflow_runs WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [userId, limit],
  );
  return res.rows;
}

async function getStatsByWorkflowKey(userId: number): Promise<
  Record<
    string,
    { count: number; avgMs: number | null; success: number; failed: number; lastRun: Date | null }
  >
> {
  const res = await pool.query(
    `SELECT workflow_key,
            COUNT(*)::int AS cnt,
            AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_ms,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS success_cnt,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_cnt,
            MAX(COALESCE(completed_at, started_at)) AS last_run
     FROM workflow_runs
     WHERE user_id = $1 AND workflow_key IS NOT NULL
     GROUP BY workflow_key`,
    [userId],
  );
  const out: Record<string, { count: number; avgMs: number | null; success: number; failed: number; lastRun: Date | null }> = {};
  for (const row of res.rows) {
    out[String(row.workflow_key)] = {
      count: Number(row.cnt),
      avgMs: row.avg_ms != null ? Math.round(Number(row.avg_ms)) : null,
      success: Number(row.success_cnt),
      failed: Number(row.failed_cnt),
      lastRun: row.last_run,
    };
  }
  return out;
}

async function fetchLatestN8nExecution(workflowId: string) {
  const { executions } = await listExecutions(workflowId, 1);
  return executions[0] || null;
}

export async function getWorkflowRuntimeOverview(userId: number): Promise<{
  n8n: Awaited<ReturnType<typeof checkN8nHealth>>;
  workflows: WorkflowRuntimeStatus[];
  apiError?: string;
}> {
  const n8n = await checkN8nHealth();
  const { workflows: n8nWorkflows, error: apiError } = n8n.reachable
    ? await listWorkflows()
    : { workflows: [], error: n8n.message };

  const queue = await getQueueCounts();
  const dbRuns = await getDbRuns(userId, 100);
  const statsByKey = await getStatsByWorkflowKey(userId);

  const statuses: WorkflowRuntimeStatus[] = [];

  for (const def of WORKFLOW_DEFINITIONS) {
    const n8nWf =
      n8nWorkflows.find((w) => w.id === def.n8nWorkflowId) ||
      n8nWorkflows.find((w) => w.name === def.n8nName);
    const workflowId = n8nWf?.id || def.n8nWorkflowId || null;

    const dbForWf = dbRuns.filter(
      (r) => r.workflow_key === def.key || r.workflow_name === def.n8nName,
    );
    const stats = statsByKey[def.key] || { count: 0, avgMs: null, success: 0, failed: 0, lastRun: null };

    let lastExecStatus: string | null = null;
    let lastRunAt: string | null = null;
    let lastError: string | null = null;
    let failureReason: string | null = null;
    let lastDurationMs: number | null = null;
    let lastExecutionId: string | null = null;
    let n8nExecutionId: string | null = null;
    let hasRunningExec = false;
    const recentLogs: WorkflowLogEntry[] = [];

    const latestDb = dbForWf[0];
    if (latestDb) {
      lastExecutionId = String(latestDb.id);
      lastExecStatus = latestDb.status;
      lastRunAt = (latestDb.completed_at || latestDb.started_at)?.toISOString?.() || null;
      lastError = latestDb.error_message;
      failureReason = latestDb.failure_reason || latestDb.error_message;
      lastDurationMs = latestDb.duration_ms;
      n8nExecutionId = latestDb.n8n_execution_id;
    }

    if (workflowId && n8n.reachable) {
      const { executions } = await listExecutions(workflowId, 8);
      for (const ex of executions) {
        const st = mapExecutionStatus(ex.status);
        const exDuration =
          (ex as { durationMs?: number }).durationMs ??
          (ex.startedAt && ex.stoppedAt
            ? new Date(ex.stoppedAt).getTime() - new Date(ex.startedAt).getTime()
            : null);
        recentLogs.push({
          id: ex.id,
          source: 'n8n',
          status: st,
          message: ex.errorMessage || `n8n execution ${st}`,
          at: ex.stoppedAt || ex.startedAt || new Date().toISOString(),
          durationMs: exDuration,
          n8nExecutionId: ex.id,
        });
        if (!ex.finished && ex.status === 'running') hasRunningExec = true;
      }
      const latestN8n = executions[0];
      if (latestN8n) {
        const n8nTime = latestN8n.stoppedAt || latestN8n.startedAt;
        const dbTime = lastRunAt ? new Date(lastRunAt).getTime() : 0;
        const n8nTs = n8nTime ? new Date(n8nTime).getTime() : 0;
        if (n8nTs >= dbTime) {
          n8nExecutionId = latestN8n.id;
          lastExecutionId = latestN8n.id;
          lastExecStatus = mapExecutionStatus(latestN8n.status);
          lastRunAt = n8nTime || lastRunAt;
          if (latestN8n.errorMessage) {
            lastError = latestN8n.errorMessage;
            failureReason = latestN8n.errorMessage;
          }
        }
      }
    }

    for (const row of dbForWf.slice(0, 8)) {
      recentLogs.push({
        id: row.id,
        source: 'database',
        status: row.status,
        message: row.failure_reason || row.error_message || `DB run ${row.status}`,
        at: (row.completed_at || row.started_at)?.toISOString?.() || String(row.started_at),
        durationMs: row.duration_ms,
        n8nExecutionId: row.n8n_execution_id,
      });
    }

    recentLogs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const state = resolveState({
      n8nOnline: n8n.reachable,
      n8nWorkflow: n8nWf,
      lastExecStatus,
      hasRunningExec,
      queueActiveForWf: queue.active > 0,
    });

    let stateMessage = failureReason || lastError;
    if (state === 'offline' && !n8nWf) {
      stateMessage = apiError || `Workflow "${def.n8nName}" not found in n8n`;
    } else if (state === 'paused') {
      stateMessage = 'Workflow is not active in n8n';
    } else if (state === 'offline' && !n8n.reachable) {
      stateMessage = n8n.message;
    }

    statuses.push({
      key: def.key,
      agent: def.agent,
      name: def.displayName,
      webhookPath: def.webhookPath,
      n8nWorkflowId: workflowId,
      state,
      n8nActive: Boolean(n8nWf?.active),
      lastExecutionId,
      n8nExecutionId,
      lastExecutionStatus: lastExecStatus,
      lastRunAt: lastRunAt || (stats.lastRun ? stats.lastRun.toISOString() : null),
      lastError: state === 'online' && !failureReason ? null : stateMessage,
      failureReason,
      lastDurationMs: lastDurationMs ?? stats.avgMs,
      executionCount: stats.count,
      avgRuntimeMs: stats.avgMs,
      successCount: stats.success,
      failedCount: stats.failed,
      queueWaiting: queue.waiting,
      queueActive: queue.active,
      recentLogs: recentLogs.slice(0, 15),
    });
  }

  return { n8n, workflows: statuses, apiError };
}

export async function getExecutionHistory(
  userId: number,
  limit = 50,
  workflowKey?: string,
): Promise<WorkflowExecutionRecord[]> {
  let sql = `SELECT id, workflow_name, workflow_key, status, error_message, failure_reason,
                    started_at, completed_at, duration_ms, n8n_execution_id, trigger_source,
                    queue_job_id, output_data, input_data
             FROM workflow_runs WHERE user_id = $1`;
  const params: (number | string)[] = [userId];
  if (workflowKey) {
    sql += ` AND workflow_key = $2`;
    params.push(workflowKey);
  }
  sql += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const res = await pool.query(sql, params);
  return res.rows.map((row: DbRunRow) => ({
    id: row.id,
    workflowKey: row.workflow_key || '',
    workflowName: row.workflow_name,
    n8nExecutionId: row.n8n_execution_id,
    status: row.status,
    triggerSource: row.trigger_source,
    queueJobId: row.queue_job_id,
    durationMs: row.duration_ms,
    failureReason: row.failure_reason,
    errorMessage: row.error_message,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() || null,
    inputData: row.input_data,
    outputData: row.output_data,
  }));
}

export async function recordWorkflowRun(params: {
  userId: number;
  workflowName: string;
  workflowKey?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  inputData?: unknown;
  outputData?: unknown;
  errorMessage?: string | null;
  failureReason?: string | null;
  durationMs?: number | null;
  startedAt?: Date;
  completedAt?: Date | null;
  n8nExecutionId?: string | null;
  triggerSource?: string;
  queueJobId?: string | null;
}): Promise<number> {
  const res = await pool.query(
    `INSERT INTO workflow_runs (
       user_id, workflow_name, workflow_key, status, input_data, output_data,
       error_message, failure_reason, duration_ms, started_at, completed_at,
       n8n_execution_id, trigger_source, queue_job_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,NOW()),$11,$12,$13,$14)
     RETURNING id`,
    [
      params.userId,
      params.workflowName,
      params.workflowKey || null,
      params.status,
      params.inputData ? JSON.stringify(params.inputData) : null,
      params.outputData ? JSON.stringify(params.outputData) : null,
      params.errorMessage || null,
      params.failureReason || null,
      params.durationMs ?? null,
      params.startedAt || null,
      params.completedAt || null,
      params.n8nExecutionId || null,
      params.triggerSource || 'api',
      params.queueJobId || null,
    ],
  );
  return res.rows[0].id as number;
}

export async function executeWorkflowRuntime(params: {
  userId: number;
  workflowKey: string;
  input?: Record<string, unknown>;
  trigger?: string;
  queueJobId?: string | null;
}): Promise<WorkflowExecuteResult> {
  const def = getWorkflowByKey(params.workflowKey);
  if (!def) return { success: false, error: `Unknown workflow: ${params.workflowKey}` };

  const health = await checkN8nHealth();
  if (!health.reachable) {
    return { success: false, error: `n8n offline: ${health.message}`, failureReason: health.message };
  }

  const payload = params.input || samplePayloadForWorkflow(def.webhookPath);
  const startedAt = new Date();

  const runId = await recordWorkflowRun({
    userId: params.userId,
    workflowName: def.n8nName,
    workflowKey: def.key,
    status: 'running',
    inputData: payload,
    startedAt,
    triggerSource: params.trigger || 'api',
    queueJobId: params.queueJobId || null,
  });

  const result = await triggerWebhook(def.webhookPath, payload);
  const workflowId = def.n8nWorkflowId;
  let n8nExecutionId: string | null = null;
  let failureReason: string | null = null;
  const logs: WorkflowLogEntry[] = [];

  if (workflowId) {
    await new Promise((r) => setTimeout(r, 400));
    const latest = await fetchLatestN8nExecution(workflowId);
    if (latest) {
      n8nExecutionId = latest.id;
      if (latest.errorMessage) failureReason = latest.errorMessage;
      logs.push({
        id: latest.id,
        source: 'n8n',
        status: mapExecutionStatus(latest.status),
        message: latest.errorMessage || `n8n ${latest.status}`,
        at: latest.stoppedAt || latest.startedAt || new Date().toISOString(),
        n8nExecutionId: latest.id,
      });
    }
  }

  if (result.ok) {
    await pool.query(
      `UPDATE workflow_runs SET status = 'completed', output_data = $1, duration_ms = $2,
       completed_at = NOW(), n8n_execution_id = $3, failure_reason = NULL
       WHERE id = $4`,
      [JSON.stringify(result.body), result.durationMs, n8nExecutionId, runId],
    );
    logs.push({
      id: runId,
      source: 'database',
      status: 'completed',
      message: `Webhook HTTP ${result.status} in ${result.durationMs}ms`,
      at: new Date().toISOString(),
      durationMs: result.durationMs,
      n8nExecutionId,
    });
    return {
      success: true,
      runId,
      n8nExecutionId,
      output: result.body,
      durationMs: result.durationMs,
      logs,
    };
  }

  const errMsg = result.error || 'Webhook execution failed';
  failureReason = failureReason || errMsg;
  await pool.query(
    `UPDATE workflow_runs SET status = 'failed', error_message = $1, failure_reason = $2,
     duration_ms = $3, completed_at = NOW(), n8n_execution_id = $4, output_data = $5
     WHERE id = $6`,
    [
      errMsg,
      failureReason,
      result.durationMs,
      n8nExecutionId,
      result.body ? JSON.stringify(result.body) : null,
      runId,
    ],
  );
  logs.push({
    id: runId,
    source: 'database',
    status: 'failed',
    message: failureReason,
    at: new Date().toISOString(),
    durationMs: result.durationMs,
    n8nExecutionId,
  });
  return {
    success: false,
    runId,
    n8nExecutionId,
    error: errMsg,
    failureReason,
    durationMs: result.durationMs,
    logs,
  };
}

export async function runAllWorkflowExecutions(
  userId: number,
  trigger = 'e2e-test',
): Promise<WorkflowExecuteResult[]> {
  const results: WorkflowExecuteResult[] = [];
  for (const def of WORKFLOW_DEFINITIONS) {
    const payload = samplePayloadForWorkflow(def.webhookPath);
    const r = await executeWorkflowRuntime({
      userId,
      workflowKey: def.key,
      input: payload,
      trigger,
    });
    results.push({ ...r, output: { workflowKey: def.key, name: def.displayName, ...((r.output as object) || {}) } });
    await new Promise((res) => setTimeout(res, 800));
  }
  return results;
}

export function workflowKeyFromJobName(workflowName: string): string | undefined {
  return WORKFLOW_NAME_TO_KEY[workflowName];
}

export async function resolvePgUserIdFromJob(userId: unknown): Promise<number> {
  if (typeof userId === 'number' && !Number.isNaN(userId)) return userId;
  const s = String(userId || '');
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  try {
    const { pool: pg } = await import('../config/db_pg');
    const r = await pg.query(`SELECT id FROM users WHERE role IN ('admin','superadmin') ORDER BY id LIMIT 1`);
    if (r.rows[0]?.id) return Number(r.rows[0].id);
  } catch {
    /* ignore */
  }
  return 1;
}
