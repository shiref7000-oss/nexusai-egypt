import { apiFetch } from './api';
import type { WorkflowLogEntry, WorkflowRuntimeState } from './agentsApi';

export type WorkflowMonitoringRow = {
  key: string;
  agent: string;
  name: string;
  webhookPath: string;
  n8nWorkflowId: string | null;
  state: WorkflowRuntimeState;
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
};

export type WorkflowExecuteResult = {
  success: boolean;
  runId?: number;
  n8nExecutionId?: string | null;
  error?: string;
  failureReason?: string | null;
  durationMs?: number;
  logs?: WorkflowLogEntry[];
  output?: unknown;
};

export const workflowsApi = {
  monitoring: () =>
    apiFetch<{
      success: boolean;
      data: {
        n8n: { reachable: boolean; status: string; message: string };
        workflows: WorkflowMonitoringRow[];
        executions: WorkflowExecutionRecord[];
        queue: unknown;
        generatedAt: string;
        runtime?: { status?: string } | null;
      };
    }>('/api/workflows/monitoring'),

  executions: (limit = 50, workflowKey?: string) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (workflowKey) q.set('workflowKey', workflowKey);
    return apiFetch<{ success: boolean; data: WorkflowExecutionRecord[] }>(
      `/api/workflows/executions?${q}`
    );
  },

  execute: (workflowKey: string, input?: Record<string, unknown>) =>
    apiFetch<{ success: boolean; data?: WorkflowExecuteResult; error?: string; failureReason?: string }>(
      `/api/workflows/${workflowKey}/execute`,
      { method: 'POST', body: JSON.stringify({ input, trigger: 'monitoring-panel' }) }
    ),

  runAllTests: () =>
    apiFetch<{
      success: boolean;
      data: {
        results: WorkflowExecuteResult[];
        summary: { total: number; succeeded: number; failed: number };
        workflows: WorkflowMonitoringRow[];
      };
    }>('/api/workflows/test/run-all', { method: 'POST', body: '{}' }),

  queueWorkflow: (workflowName: string, input: Record<string, unknown>) =>
    apiFetch<{ success: boolean; data: { jobId: string; status: string } }>(
      '/api/queue/workflow',
      { method: 'POST', body: JSON.stringify({ workflowName, input, trigger: 'monitoring-queue' }) }
    ),
};
