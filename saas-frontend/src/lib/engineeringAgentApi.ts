import { apiFetch } from './api';

export type AgentTaskStatus = 'pending' | 'planning' | 'running' | 'review' | 'completed' | 'failed';

export type EngineeringTask = {
  id: string;
  title: string;
  prompt: string;
  status: AgentTaskStatus;
  plan_json?: unknown;
  result_report?: string | null;
  error_message?: string | null;
  files_touched?: string[] | null;
  created_at: string;
  updated_at: string;
};

export type TaskLog = {
  id: number;
  level: string;
  event_type: string;
  message: string | null;
  payload: unknown;
  created_at: string;
};

export type AgentMemory = {
  id: number;
  scope: string;
  category: string;
  key: string;
  content: string;
  updated_at: string;
};

const base = '/api/engineering-agent';

export const engineeringAgentApi = {
  status: () => apiFetch<{ success: boolean; data: { enabled: boolean; repoRoot: string } }>(`${base}/status`),

  chat: (message: string, title?: string) =>
    apiFetch<{ success: boolean; data: { taskId: string; status: string; message: string } }>(`${base}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, title }),
    }),

  ask: (message: string) =>
    apiFetch<{ success: boolean; data: { response: string; provider: string } }>(`${base}/ask`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  tasks: () => apiFetch<{ success: boolean; data: EngineeringTask[] }>(`${base}/tasks`),

  task: (id: string) => apiFetch<{ success: boolean; data: EngineeringTask }>(`${base}/tasks/${id}`),

  logs: (id: string) => apiFetch<{ success: boolean; data: TaskLog[] }>(`${base}/tasks/${id}/logs`),

  retry: (id: string) =>
    apiFetch<{ success: boolean; data: { taskId: string; status: string } }>(`${base}/tasks/${id}/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  memory: (scope = 'platform') =>
    apiFetch<{ success: boolean; data: AgentMemory[] }>(`${base}/memory?scope=${scope}`),

  saveMemory: (body: { category: string; key: string; content: string; scope?: string }) =>
    apiFetch(`${base}/memory`, { method: 'POST', body: JSON.stringify(body) }),

  reindex: () => apiFetch(`${base}/index`, { method: 'POST' }),
};
