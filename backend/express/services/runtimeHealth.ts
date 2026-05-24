import { redis } from './queue';
import { pool } from '../config/db_pg';
import { checkN8nHealth } from './n8n';
import { getProviderHealth } from './ai';
import { getQueueStatus } from './queue';
import { logger } from '../config/logger';

export type RuntimeHealthReport = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  api: { uptime: number; memoryMb: number };
  database: { ok: boolean; latencyMs: number | null; error?: string };
  redis: { ok: boolean; status: string };
  n8n: Awaited<ReturnType<typeof checkN8nHealth>>;
  aiProviders: ReturnType<typeof getProviderHealth>;
  queue: Awaited<ReturnType<typeof getQueueStatus>>;
  workflows: {
    failedLast24h: number;
    running: number;
    avgDurationMs: number | null;
  };
  webhooks: {
    failedIncomingLast24h: number;
  };
  workers: {
    note: string;
    recentFailures: unknown[];
  };
};

export async function getRuntimeHealthReport(): Promise<RuntimeHealthReport> {
  let dbOk = false;
  let dbLatency: number | null = null;
  let dbError: string | undefined;
  const dbStart = Date.now();
  try {
    await pool.query('SELECT 1');
    dbOk = true;
    dbLatency = Date.now() - dbStart;
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'db error';
  }

  let redisOk = false;
  let redisStatus = 'unknown';
  try {
    const pong = await redis.ping();
    redisOk = pong === 'PONG';
    redisStatus = redis.status;
  } catch {
    redisStatus = 'error';
  }

  const n8n = await checkN8nHealth();
  const queue = await getQueueStatus();

  let failedLast24h = 0;
  let running = 0;
  let avgDurationMs: number | null = null;
  try {
    const wf = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours')::int AS failed_24h,
         COUNT(*) FILTER (WHERE status = 'running')::int AS running,
         AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL AND started_at > NOW() - INTERVAL '24 hours') AS avg_ms
       FROM workflow_runs`,
    );
    failedLast24h = Number(wf.rows[0]?.failed_24h || 0);
    running = Number(wf.rows[0]?.running || 0);
    avgDurationMs = wf.rows[0]?.avg_ms != null ? Math.round(Number(wf.rows[0].avg_ms)) : null;
  } catch (err) {
    logger.warn('workflow_runs health query failed', { error: err instanceof Error ? err.message : err });
  }

  let failedWebhooks = 0;
  try {
    const wh = await pool.query(
      `SELECT COUNT(*)::int AS c FROM incoming_webhook_logs
       WHERE created_at > NOW() - INTERVAL '24 hours'
         AND (status = 'failed' OR http_status >= 400)`,
    );
    failedWebhooks = Number(wh.rows[0]?.c || 0);
  } catch {
    /* table may not exist on older DBs */
  }

  const unhealthy = !dbOk || !redisOk || !n8n.reachable;
  const degraded =
    !unhealthy &&
    (failedLast24h > 0 ||
      (queue.workflow?.failed ?? 0) > 0 ||
      (queue.deadLetter?.count ?? 0) > 0 ||
      !getProviderHealth().some((p) => p.healthy));

  return {
    status: unhealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    api: {
      uptime: process.uptime(),
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    database: { ok: dbOk, latencyMs: dbLatency, error: dbError },
    redis: { ok: redisOk, status: redisStatus },
    n8n,
    aiProviders: getProviderHealth(),
    queue,
    workflows: { failedLast24h, running, avgDurationMs },
    webhooks: { failedIncomingLast24h: failedWebhooks },
    workers: {
      note: 'BullMQ workers run in-process with API',
      recentFailures: queue.recentFailures || [],
    },
  };
}
