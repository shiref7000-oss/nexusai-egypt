import { env } from '../config/env';
import { logger } from '../config/logger';

export type N8nHealth = {
  reachable: boolean;
  status: 'online' | 'offline';
  message: string;
  version?: string;
};

export type N8nWorkflowRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type N8nExecutionRow = {
  id: string;
  workflowId: string;
  status: 'success' | 'error' | 'running' | 'waiting' | 'canceled' | 'unknown';
  startedAt?: string;
  stoppedAt?: string;
  finished: boolean;
  mode?: string;
  errorMessage?: string;
  durationMs?: number | null;
};

function baseUrl(): string {
  return (env.N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (env.N8N_API_KEY) headers['X-N8N-API-KEY'] = env.N8N_API_KEY;
  return headers;
}

async function n8nFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const url = `${baseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(init?.headers as Record<string, string>),
      },
    });
    clearTimeout(timeout);
    const text = await res.text();
    let data: T | undefined;
    try {
      data = text ? (JSON.parse(text) as T) : undefined;
    } catch {
      data = undefined;
    }
    if (!res.ok) {
      const msg =
        (data as { message?: string })?.message ||
        text?.slice(0, 200) ||
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : 'n8n request failed';
    return { ok: false, status: 0, error: message };
  }
}

export async function checkN8nHealth(): Promise<N8nHealth> {
  try {
    const res = await fetch(`${baseUrl()}/healthz`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { reachable: false, status: 'offline', message: `healthz returned ${res.status}` };
    }
    const body = (await res.json()) as { status?: string };
    return {
      reachable: true,
      status: 'online',
      message: body.status === 'ok' ? 'n8n is healthy' : `n8n health: ${body.status || 'unknown'}`,
    };
  } catch (err: unknown) {
    return {
      reachable: false,
      status: 'offline',
      message: err instanceof Error ? err.message : 'Cannot reach n8n',
    };
  }
}

export async function listWorkflows(): Promise<{ workflows: N8nWorkflowRow[]; error?: string }> {
  const health = await checkN8nHealth();
  if (!health.reachable) {
    return { workflows: [], error: health.message };
  }

  const result = await n8nFetch<{ data?: N8nWorkflowRow[] }>('/api/v1/workflows?limit=100');
  if (result.ok && result.data?.data) {
    return { workflows: result.data.data };
  }

  const { listWorkflowsFromSqlite, readN8nDbPath } = await import('./n8nSqlite');
  const sqliteRows = await listWorkflowsFromSqlite(readN8nDbPath());
  if (sqliteRows.length > 0) {
    return {
      workflows: sqliteRows.map((r) => ({
        id: r.id,
        name: r.name,
        active: r.active,
      })),
      error: result.error ? `n8n API unavailable (${result.error}); using local n8n database` : undefined,
    };
  }

  return { workflows: [], error: result.error || 'Failed to list workflows from n8n API' };
}

export async function listExecutions(workflowId?: string, limit = 10): Promise<{ executions: N8nExecutionRow[]; error?: string }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (workflowId) params.set('workflowId', workflowId);
  const result = await n8nFetch<{ data?: N8nExecutionRow[] }>(`/api/v1/executions?${params}`);
  if (result.ok && result.data?.data) {
    return { executions: result.data.data };
  }

  if (workflowId) {
    const { listExecutionsFromSqlite, readN8nDbPath } = await import('./n8nSqlite');
    const sqliteExecs = await listExecutionsFromSqlite(workflowId, limit, readN8nDbPath());
    if (sqliteExecs.length > 0) {
      return { executions: sqliteExecs };
    }
  }

  return { executions: [], error: result.error };
}

export async function setWorkflowActive(workflowId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const path = active ? `/api/v1/workflows/${workflowId}/activate` : `/api/v1/workflows/${workflowId}/deactivate`;
  const result = await n8nFetch(path, { method: 'POST' });
  return { ok: result.ok, error: result.error };
}

export async function triggerWebhook(
  webhookPath: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body?: unknown; error?: string; durationMs: number }> {
  const start = Date.now();
  const url = `${baseUrl()}/webhook/${webhookPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        error: `Webhook returned HTTP ${res.status}: ${text.slice(0, 300)}`,
        durationMs: Date.now() - start,
      };
    }
    return { ok: true, status: res.status, body, durationMs: Date.now() - start };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : 'Webhook request failed';
    logger.error('n8n webhook trigger failed', { webhookPath, message });
    return { ok: false, status: 0, error: message, durationMs: Date.now() - start };
  }
}

/** Sample payloads for health / manual test runs (no fake success). */
export function samplePayloadForWorkflow(webhookPath: string): Record<string, unknown> {
  switch (webhookPath) {
    case 'customer-support-agent':
      return { message: 'Where is my order?', phone: '+201000000000', orderId: 'TEST-001' };
    case 'order-confirmation-agent':
      return {
        order: {
          orderId: 'TEST-001',
          phone: '+201000000000',
          amount: 500,
          city: 'cairo',
          product: 'Test Product',
          customerName: 'Test User',
        },
      };
    case 'ads-creative-agent':
      return { product: 'Wireless Earbuds', platform: 'meta', language: 'ar' };
    case 'shipping-tracking-agent':
      return { trackingNumber: 'TRK-TEST-001', carrier: 'bosta', orderId: 'TEST-001' };
    case 'analytics-agent':
      return {
        metrics: {
          totalRevenue: 10000,
          totalOrders: 50,
          confirmedOrders: 40,
          deliveredOrders: 35,
          adSpend: 2000,
          roas: 3.2,
          cpa: 40,
          confirmationRate: 80,
          deliveryRate: 70,
        },
      };
    default:
      return { ping: true, source: 'nexusai-runtime' };
  }
}
