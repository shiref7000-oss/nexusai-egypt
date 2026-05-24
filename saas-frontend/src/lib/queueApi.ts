import { apiFetch } from './api';

export const queueApi = {
  status: () => apiFetch<{ success: boolean; data: Record<string, unknown> }>('/api/queue/status'),
};
