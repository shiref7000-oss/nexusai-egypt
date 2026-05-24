import { apiFetch } from './api';

export interface IntegrationRow {
  id: number;
  name: string;
  enabled: boolean;
  incoming_webhook_url?: string;
}

export interface IntegrationStats {
  integrations: number;
  orders: { total?: number };
  incoming_webhooks_24h: { success?: number; failed?: number };
}

export interface IncomingLogRow {
  id: number;
  created_at: string;
  integration_name: string;
  status: string;
  http_status: number;
  error_message?: string;
  validation_errors?: unknown;
  raw_payload?: unknown;
  payload_preview?: unknown;
}

export const integrationsApi = {
  stats: () =>
    apiFetch<{ success: boolean; data: IntegrationStats }>('/api/integrations/stats'),
  list: () =>
    apiFetch<{ success: boolean; data: IntegrationRow[] }>('/api/integrations'),
  incomingLogs: (limit = 50) =>
    apiFetch<{ success: boolean; data: IncomingLogRow[] }>(
      `/api/integrations/incoming-logs?limit=${limit}`
    ),
  create: (name: string) =>
    apiFetch<{ success: boolean; data: IntegrationRow & { incoming_secret?: string } }>(
      '/api/integrations',
      { method: 'POST', body: JSON.stringify({ name }) }
    ),
  patch: (id: number, body: Record<string, unknown>) =>
    apiFetch(`/api/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: async (id: number, confirm = false) => {
    const res = await fetch(
      `/api/integrations/${id}${confirm ? '?confirm=true' : ''}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('nexusai_token') || ''}`,
        },
      }
    );
    const json = await res.json();
    if (res.status === 401) {
      const { redirectToLogin } = await import('./api');
      redirectToLogin();
      throw new Error('Session expired');
    }
    if (res.status === 409 && json.code === 'ORDERS_EXIST') {
      const err = new Error(json.error || 'Orders exist') as Error & {
        body?: typeof json;
      };
      err.body = json;
      throw err;
    }
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `Delete failed (${res.status})`);
    }
    return json;
  },
  testIncomingOrder: (id: number) =>
    apiFetch<{ success: boolean; data?: Record<string, unknown>; error?: string }>(
      `/api/integrations/${id}/test-incoming-order`,
      { method: 'POST' }
    ),
  regenerateSecret: (id: number) =>
    apiFetch<{ success: boolean; data: IntegrationRow & { incoming_secret?: string } }>(
      `/api/integrations/${id}/regenerate-incoming-secret`,
      { method: 'POST' }
    ),
};
