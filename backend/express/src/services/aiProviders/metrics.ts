import { pool } from '../../config/db_pg';
import { logger } from '../../config/logger';
import type { CompletionResult, ProviderAttemptLog, ProviderHealth, ProviderId } from './types';

interface ProviderRuntimeState {
  failures: number;
  disabledUntil: number;
  lastError: string | null;
  lastSuccessAt: number | null;
  totalLatencyMs: number;
  callCount: number;
  successCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

const runtime = new Map<ProviderId, ProviderRuntimeState>();
const recentAttempts: ProviderAttemptLog[] = [];
const MAX_RECENT = 200;

function state(id: ProviderId): ProviderRuntimeState {
  if (!runtime.has(id)) {
    runtime.set(id, {
      failures: 0,
      disabledUntil: 0,
      lastError: null,
      lastSuccessAt: null,
      totalLatencyMs: 0,
      callCount: 0,
      successCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
  }
  return runtime.get(id)!;
}

export function isProviderAvailable(id: ProviderId): boolean {
  const s = state(id);
  if (Date.now() < s.disabledUntil) return false;
  return true;
}

export function recordAttempt(log: ProviderAttemptLog): void {
  recentAttempts.push(log);
  if (recentAttempts.length > MAX_RECENT) recentAttempts.shift();

  const s = state(log.provider);
  s.callCount++;
  s.totalLatencyMs += log.latencyMs;

  if (log.success) {
    s.failures = 0;
    s.lastError = null;
    s.lastSuccessAt = log.timestamp;
    s.successCount++;
  } else {
    s.failures++;
    s.lastError = log.error || 'failed';
    if (s.failures >= 3) {
      s.disabledUntil = Date.now() + 5 * 60 * 1000;
      logger.warn('AI provider temporarily disabled', { provider: log.provider, error: s.lastError });
    }
  }
}

export function recordSuccessResult(result: CompletionResult): void {
  const s = state(result.provider);
  s.totalTokens += result.usage.totalTokens;
  s.estimatedCostUsd += result.costUsd;
}

export function buildHealth(
  adapters: { id: ProviderId; model: string; isConfigured: () => boolean }[]
): ProviderHealth[] {
  return adapters.map((a) => {
    const s = state(a.id);
    const healthy =
      a.isConfigured() &&
      isProviderAvailable(a.id) &&
      (s.callCount === 0 || s.successCount / s.callCount > 0.2);
    return {
      id: a.id,
      model: a.model,
      enabled: a.isConfigured() && isProviderAvailable(a.id),
      healthy,
      configured: a.isConfigured(),
      failures: s.failures,
      lastError: s.lastError,
      lastSuccessAt: s.lastSuccessAt,
      avgLatencyMs: s.callCount > 0 ? Math.round(s.totalLatencyMs / s.callCount) : 0,
      callCount: s.callCount,
      totalTokens: s.totalTokens,
      estimatedCostUsd: Math.round(s.estimatedCostUsd * 1_000_000) / 1_000_000,
    };
  });
}

export function getRecentAttempts(limit = 50): ProviderAttemptLog[] {
  return recentAttempts.slice(-limit).reverse();
}

export async function getDbProviderAnalytics(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const byProvider = await pool.query(
    `SELECT provider,
            COUNT(*)::int AS requests,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COALESCE(SUM(total_tokens), 0)::int AS tokens,
            COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
     FROM ai_requests
     WHERE created_at >= $1
     GROUP BY provider
     ORDER BY requests DESC`,
    [since]
  );

  const daily = await pool.query(
    `SELECT DATE(created_at) AS day,
            provider,
            COUNT(*)::int AS requests,
            COALESCE(SUM(total_tokens), 0)::int AS tokens
     FROM ai_requests
     WHERE created_at >= $1
     GROUP BY DATE(created_at), provider
     ORDER BY day DESC
     LIMIT 90`,
    [since]
  );

  const totals = await pool.query(
    `SELECT COUNT(*)::int AS total_requests,
            COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
            COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
     FROM ai_requests
     WHERE created_at >= $1 AND status = 'completed'`,
    [since]
  );

  return {
    periodDays: days,
    totals: totals.rows[0] || {},
    byProvider: byProvider.rows,
    daily: daily.rows,
  };
}
