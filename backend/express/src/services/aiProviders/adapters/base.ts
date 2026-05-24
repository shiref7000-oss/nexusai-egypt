import type { CompletionRequest, CompletionResult, ProviderId } from '../types';

export interface ProviderAdapter {
  id: ProviderId;
  model: string;
  isConfigured(): boolean;
  complete(req: CompletionRequest, attempt: number): Promise<CompletionResult>;
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit')
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15000);
}
