const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Build API URL without duplicating /api when VITE_API_URL already ends with /api. */
export function apiUrl(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  const base = API_BASE.replace(/\/$/, '');
  if (!base) return p;
  if (base.endsWith('/api') && (p === '/api' || p.startsWith('/api/'))) {
    p = p === '/api' ? '' : p.slice(4);
  }
  return `${base}${p}`;
}

import { workspaceHeaders } from '@/lib/workspaceContext';

export function authHeaders(): HeadersInit {
  const token = localStorage.getItem('nexusai_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...workspaceHeaders(),
  };
}

/** For FormData uploads — do not set Content-Type (browser sets multipart boundary). */
export function authHeadersMultipart(): HeadersInit {
  const token = localStorage.getItem('nexusai_token');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...workspaceHeaders(),
  };
}

/** Browser-router login redirect (never hash — gateway + BrowserRouter use pathname). */
export function redirectToLogin(): void {
  const returnTo = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`
  );
  const target =
    returnTo && returnTo !== '%2F' && returnTo !== '%2Flogin'
      ? `/login?returnTo=${returnTo}`
      : '/login';
  window.location.assign(target);
}

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const ENGINEERING_MUTATION_TIMEOUT_MS = 90_000;

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? 3 : 1;
  const timeoutMs =
    init.signal != null
      ? 0
      : path.includes('engineering-agent') && method !== 'GET'
        ? ENGINEERING_MUTATION_TIMEOUT_MS
        : DEFAULT_FETCH_TIMEOUT_MS;
  let attempt = 0;
  let res: Response | null = null;
  while (attempt < maxAttempts) {
    attempt++;
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId =
      controller != null
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;
    try {
      res = await fetch(apiUrl(path), {
        ...init,
        signal: init.signal ?? controller?.signal,
        headers: { ...authHeaders(), ...(init.headers || {}) },
      });
    } catch (fetchErr: unknown) {
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw fetchErr;
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
    }
    if (res.status !== 429 || attempt >= maxAttempts) break;
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const backoff = (retryAfter > 0 ? retryAfter * 1000 : 400 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 150);
    await new Promise((r) => setTimeout(r, backoff));
  }
  if (!res) throw new Error('Request failed');
  let json: { success?: boolean; error?: string; message?: string };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Invalid response (${res.status})`);
  }
  if (res.status === 401) {
    localStorage.removeItem('nexusai_token');
    localStorage.removeItem('nexusai_user');
    localStorage.removeItem('nexusai_impersonator');
    redirectToLogin();
    throw new Error('Session expired');
  }
  if (path.includes('engineering-agent') && typeof window !== 'undefined') {
    void import('@/lib/perfProbe').then(({ trackApiCall }) => {
      const bytes =
        Number(res.headers.get('content-length')) ||
        new TextEncoder().encode(JSON.stringify(json)).length;
      trackApiCall(path.replace(/\?.*$/, ''), bytes);
    });
  }
  if (!res.ok || json.success === false) {
    const err: any = new Error(json.error || json.message || `Request failed (${res.status})`);
    err.status = res.status;
    const retryAfter = Number(res.headers.get('retry-after') || 0) || (json as any).retryAfter;
    if (retryAfter) err.retryAfter = retryAfter;
    throw err;
  }
  return json as T;
}
