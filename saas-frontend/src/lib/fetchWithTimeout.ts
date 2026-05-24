import { apiUrl, authHeaders, redirectToLogin } from './api';

export type ApiFetchOptions = RequestInit & {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function apiFetchWithTimeout<T = unknown>(
  path: string,
  init: ApiFetchOptions = {}
): Promise<T> {
  const { timeoutMs = 20000, signal: externalSignal, ...rest } = init;
  const method = (rest.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? 2 : 1;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let attempt = 0;
  let res: Response | null = null;

  try {
    while (attempt < maxAttempts) {
      attempt++;
      res = await fetch(apiUrl(path), {
        ...rest,
        headers: { ...authHeaders(), ...(rest.headers || {}) },
        signal: controller.signal,
      });
      if (res.status !== 429 || attempt >= maxAttempts) break;
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      const backoff =
        (retryAfter > 0 ? retryAfter * 1000 : 400 * Math.pow(2, attempt - 1)) +
        Math.floor(Math.random() * 150);
      await new Promise((r) => setTimeout(r, backoff));
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      const secs = Math.round(timeoutMs / 1000);
      throw new Error(
        `Request timed out after ${secs}s. The server may still be processing — refresh the page and check Saved reports.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
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

  if (!res.ok || json.success === false) {
    const err = new Error(json.error || json.message || `Request failed (${res.status})`) as Error & {
      status?: number;
      retryAfter?: number;
    };
    err.status = res.status;
    const retryAfter = Number(res.headers.get('retry-after') || 0) || (json as { retryAfter?: number }).retryAfter;
    if (retryAfter) err.retryAfter = retryAfter;
    throw err;
  }

  return json as T;
}
