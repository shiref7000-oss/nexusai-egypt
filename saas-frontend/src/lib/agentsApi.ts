import { apiFetch } from './api';

export type AgentConfig = {
  id: string;
  agent_id: string;
  agent_name: string;
  is_active: boolean;
  capabilities: string[];
  settings?: Record<string, unknown>;
  updated_at?: string;
};

export type AgentActivity = {
  id: string;
  agent_id: string;
  agent_name?: string;
  action: string;
  status: string;
  created_at: string;
};

export type WorkflowRuntimeState = 'online' | 'offline' | 'running' | 'paused' | 'failed';

export type WorkflowLogEntry = {
  id: number | string;
  source: string;
  status: string;
  message: string;
  at: string;
};

export type WorkflowStatus = {
  agent: string;
  name: string;
  path: string;
  key?: string;
  status: WorkflowRuntimeState | string;
  lastRun: string | null;
  responseTime?: number | null;
  error?: string | null;
  failureReason?: string | null;
  n8nWorkflowId?: string | null;
  n8nExecutionId?: string | null;
  lastExecutionId?: string | null;
  lastExecutionStatus?: string | null;
  executionCount?: number;
  avgRuntimeMs?: number | null;
  successCount?: number;
  failedCount?: number;
  n8nActive?: boolean;
  recentLogs?: WorkflowLogEntry[];
};

export type WorkflowStatusResponse = {
  success: boolean;
  data: WorkflowStatus[];
  n8n?: { reachable: boolean; status: string; message: string };
};

export const agentsApi = {
  list: () => apiFetch<{ success: boolean; data: AgentConfig[] }>('/api/agents'),
  toggle: (agentId: string) =>
    apiFetch<{ success: boolean; data: AgentConfig; message?: string }>(
      `/api/agents/${agentId}/toggle`,
      { method: 'POST', body: '{}' }
    ),
  activity: () =>
    apiFetch<{ success: boolean; data: AgentActivity[] }>('/api/agents/activity'),
  workflowStatus: () =>
    apiFetch<WorkflowStatusResponse>('/api/agents/workflows/status'),
  workflowHealth: () =>
    apiFetch<{ success: boolean; data: { reachable: boolean; status: string; message: string } }>(
      '/api/workflows/health'
    ),
  executeWorkflow: (workflowKey: string, input?: Record<string, unknown>) =>
    apiFetch<{ success: boolean; data?: unknown; error?: string }>(
      `/api/workflows/${workflowKey}/execute`,
      { method: 'POST', body: JSON.stringify({ input, trigger: 'dashboard' }) }
    ),
  providerStatus: () =>
    apiFetch<{ success: boolean; data: unknown[]; timestamp?: string }>(
      '/api/agents/providers/status'
    ),
};

export function workflowStateLabel(state: string): string {
  switch (state) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
    case 'active':
      return 'Online';
    case 'error':
      return 'Failed';
    default:
      return state;
  }
}

export function workflowStateClass(state: string): string {
  switch (state) {
    case 'online':
    case 'active':
      return 'text-green-400 bg-green-500/10 border-green-500/20';
    case 'running':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'paused':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'failed':
    case 'error':
      return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'offline':
    default:
      return 'text-gray-400 bg-white/5 border-white/10';
  }
}
