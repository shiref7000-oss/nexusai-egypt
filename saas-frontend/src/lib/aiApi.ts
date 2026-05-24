import { apiFetch } from './api';

export type AiProcessResult = {
  success: boolean;
  response?: string;
  structured?: unknown;
  provider?: string;
  model?: string;
  latency?: number;
  error?: string;
  agent?: string;
};

export const aiApi = {
  process: (agent: string, prompt: string, context?: Record<string, unknown>) =>
    apiFetch<AiProcessResult>('/api/ai/process', {
      method: 'POST',
      body: JSON.stringify({ agent, prompt, context }),
    }),
  recommendations: () =>
    apiFetch<{ success: boolean; data: unknown[] }>('/api/ai/recommendations'),
};
