/**
 * BullMQ worker process — separate from API HTTP server.
 * PM2: nexusai-worker (RUN_WORKERS=true, does not serve merchant API traffic).
 */
import express from 'express';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeQueues, getQueueStatus, redis, startQueueWorkers } from './services/queue';

async function main() {
  startQueueWorkers();

  const app = express();
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      role: 'worker',
      redis: redis.status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/worker', async (_req, res) => {
    try {
      const data = await getQueueStatus();
      res.json({ success: true, data });
    } catch (err: unknown) {
      res.status(503).json({
        success: false,
        error: err instanceof Error ? err.message : 'Queue status unavailable',
      });
    }
  });

  const server = app.listen(env.WORKER_HEALTH_PORT, () => {
    logger.info(`NexusAI worker health listening on ${env.WORKER_HEALTH_PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Worker received ${signal}`);
    server.close(async () => {
      await closeQueues();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Worker bootstrap failed', { error: err instanceof Error ? err.message : err });
  process.exit(1);
});
