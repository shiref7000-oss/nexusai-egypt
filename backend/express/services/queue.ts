import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { processAIRequest } from './ai';
import { logger } from '../config/logger';
import { env } from '../config/env';

// ============================================================
// Redis Connection with Production Hardening
// ============================================================
export const redis = new IORedis({
  host: env.REDIS_HOST || '178.16.129.216',
  port: parseInt(env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 3000);
    logger.warn(`Redis reconnecting, attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT'];
    const shouldReconnect = targetErrors.some(e => err.message.includes(e));
    if (shouldReconnect) {
      logger.error('Redis reconnect triggered', { error: err.message });
    }
    return shouldReconnect;
  },
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis ready for operations');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// ============================================================
// BullMQ Queues with Dead Letter Queue Support
// ============================================================

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 3600 * 24, count: 500 }, // Keep 24h / 500 jobs
  removeOnFail: { age: 3600 * 48, count: 200 },     // Keep 48h / 200 failed
};

export const aiQueue = new Queue('ai-requests', {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 5000 },
  },
});

export const workflowQueue = new Queue('workflow-executions', {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'fixed' as const, delay: 10000 },
  },
});

export const analyticsQueue = new Queue('analytics-jobs', {
  connection: redis,
  defaultJobOptions,
});

export const shippingQueue = new Queue('shipping-jobs', {
  connection: redis,
  defaultJobOptions,
});

export const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2000 },
  },
});

// Dead Letter Queue for exhausted retries
export const deadLetterQueue = new Queue('dead-letter', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { age: 3600 * 24 * 7, count: 1000 }, // Keep 7 days
    removeOnFail: false, // Never remove from DLQ
  },
});

export const webhookOutboundQueue = new Queue('webhook-outbound', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 10000 },
    removeOnComplete: { age: 3600 * 24 * 3, count: 2000 },
    removeOnFail: { age: 3600 * 24 * 7, count: 500 },
  },
});

// ============================================================
// Execution Metrics Store (with persistence hooks)
// ============================================================
const executionMetrics: Map<string, any> = new Map();
const failedJobLog: Map<string, any> = new Map();

// ============================================================
// Dead Letter Queue Handler
// ============================================================
async function handleFailedJob(job: Job, err: Error, queueName: string) {
  const failureRecord = {
    originalJobId: job.id,
    originalQueue: queueName,
    agent: job.data?.agent || job.data?.workflowName || 'unknown',
    error: err.message,
    errorStack: env.NODE_ENV === 'development' ? err.stack : undefined,
    failedAt: new Date().toISOString(),
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts?.attempts || 3,
    data: { ...job.data, prompt: job.data?.prompt?.slice(0, 200) }, // Truncate for safety
    timestamp: Date.now(),
  };

  // Log to memory
  failedJobLog.set(job.id as string, failureRecord);

  // Move to dead letter queue
  try {
    await deadLetterQueue.add(`dlq-${queueName}-${job.id}`, failureRecord, {
      priority: 1,
    });
    logger.error(`Job ${job.id} moved to dead letter queue from ${queueName}`, {
      error: err.message,
      attempts: job.attemptsMade,
    });
  } catch (dlqErr: any) {
    logger.error(`Failed to move job ${job.id} to DLQ`, { error: dlqErr.message });
  }
}

// ============================================================
// AI Request Worker with Enhanced Error Handling
// ============================================================
const aiWorker = new Worker('ai-requests', async (job: Job) => {
  const start = Date.now();
  const { agent, prompt, context, userId } = job.data;
  const jobId = job.id;

  try {
    logger.info(`Processing AI job ${jobId}`, { agent, prompt: prompt?.slice(0, 80), userId });

    const result = await processAIRequest({ agent, prompt, context, userId });
    const latency = Date.now() - start;

    if (userId && typeof userId === 'number') {
      try {
        const { recordUsage } = await import('./usage');
        await recordUsage({
          userId,
          model: result.model || result.provider,
          provider: result.provider,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          totalTokens: result.usage?.totalTokens,
          costUsd: result.usage?.costUsd,
          latencyMs: latency,
          status: result.success ? 'completed' : 'failed',
          prompt: prompt || '',
          response: result.response || '',
          errorMessage: result.error,
          agent,
        });
      } catch (usageErr: any) {
        logger.warn('Queue usage record skipped', { error: usageErr.message, userId });
      }
    }

    // Store metrics
    const metric = {
      jobId,
      agent,
      provider: result.provider,
      latency,
      success: result.success,
      userId,
      timestamp: new Date().toISOString(),
    };
    executionMetrics.set(jobId as string, metric);

    // Persist to Supabase if connected (fire and forget)
    // await persistAIMetric(metric).catch(() => {});

    return { success: true, result, latency };
  } catch (err: any) {
    logger.error(`AI job ${jobId} failed`, { error: err.message, agent });
    throw err; // Will trigger retry or dead letter
  }
}, {
  connection: redis,
  concurrency: 5,
  limiter: { max: 30, duration: 60000 },
});

// ============================================================
// Workflow Execution Worker
// ============================================================
const workflowWorker = new Worker('workflow-executions', async (job: Job) => {
  const start = Date.now();
  const { workflowName, input, trigger, userId } = job.data;

  try {
    logger.info(`Executing workflow ${workflowName}`, { jobId: job.id, trigger, userId });

    const { workflowKeyFromJobName, executeWorkflowRuntime, resolvePgUserIdFromJob } = await import('./workflowRuntime');
    const workflowKey = workflowKeyFromJobName(workflowName);
    const numericUserId = await resolvePgUserIdFromJob(userId);

    if (workflowKey) {
      const run = await executeWorkflowRuntime({
        userId: numericUserId,
        workflowKey,
        input: input || {},
        trigger: trigger || 'queue',
        queueJobId: job.id ? String(job.id) : null,
      });
      if (!run.success) {
        throw new Error(run.error || 'n8n workflow execution failed');
      }
      return {
        success: true,
        workflowName,
        workflowKey,
        runId: run.runId,
        result: run.output,
        latency: run.durationMs ?? Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    const agentMap: Record<string, string> = {
      'Customer Support': 'support',
      'Order Confirmation': 'confirmation',
      'Ads Creative': 'ads',
      'Shipping Tracking': 'shipping',
      Analytics: 'meta',
    };
    const agent = agentMap[workflowName] || 'support';
    const prompt = input?.prompt || input?.message || 'Process request';
    const result = await processAIRequest({ agent, prompt, context: input });

    return {
      success: true,
      workflowName,
      result,
      latency: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error(`Workflow ${workflowName} failed`, { error: err.message, jobId: job.id });
    throw err;
  }
}, {
  connection: redis,
  concurrency: 3,
});

// ============================================================
// Notification Worker
// ============================================================
// ============================================================
// Outbound Webhook Delivery Worker
// ============================================================
const webhookOutboundWorker = new Worker('webhook-outbound', async (job: Job) => {
  const { webhookId, logId, eventId, attempt } = job.data;
  const { pool } = require('../config/db_pg');
  const { deliverWebhook } = require('./webhookDelivery');
  const { updateWebhookLog } = require('./integrationsDb');

  const eventRes = await pool.query('SELECT * FROM webhook_events WHERE id = $1', [eventId]);
  const event = eventRes.rows[0];
  if (!event) throw new Error(`Event ${eventId} not found`);

  await updateWebhookLog(logId, { status: 'pending', attemptCount: attempt });

  const result = await deliverWebhook(webhookId, logId, event);
  if (!result.success) {
    throw new Error(result.errorMessage || 'Delivery failed');
  }
  return result;
}, {
  connection: redis,
  concurrency: 8,
  limiter: { max: 60, duration: 60000 },
});

const notificationWorker = new Worker('notifications', async (job: Job) => {
  const { type, payload } = job.data;
  logger.info(`Processing notification ${job.id}`, { type });

  // Mock notification processing
  return { success: true, type, processedAt: new Date().toISOString() };
}, {
  connection: redis,
  concurrency: 10,
});

// ============================================================
// Event Handlers for Monitoring & Dead Letter
// ============================================================

aiWorker.on('completed', (job) => {
  logger.info(`AI job ${job.id} completed`, {
    latency: Date.now() - (job.processedOn || Date.now()),
    agent: job.data?.agent,
  });
});

aiWorker.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    handleFailedJob(job, err, 'ai-requests');
  }
  logger.error(`AI job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts})`, {
    error: err.message,
  });
});

workflowWorker.on('completed', (job) => {
  logger.info(`Workflow ${job.id} completed`, {
    workflowName: job.data?.workflowName,
  });
});

workflowWorker.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    handleFailedJob(job, err, 'workflow-executions');
  }
  logger.error(`Workflow ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts})`, {
    error: err.message,
  });
});

notificationWorker.on('completed', (job) => {
  logger.info(`Notification ${job.id} completed`);
});

notificationWorker.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts?.attempts || 5)) {
    handleFailedJob(job, err, 'notifications');
  }
  logger.error(`Notification ${job?.id} failed`, { error: err.message });
});

webhookOutboundWorker.on('completed', (job) => {
  logger.info(`Webhook delivery ${job.id} completed`, { logId: job.data?.logId });
});

webhookOutboundWorker.on('failed', async (job, err) => {
  if (!job) return;
  const maxAttempts = job.opts?.attempts || 5;
  if (job.attemptsMade >= maxAttempts) {
    try {
      const { updateWebhookLog } = require('./integrationsDb');
      await updateWebhookLog(job.data.logId, {
        status: 'dead_letter',
        errorMessage: err.message,
        attemptCount: job.attemptsMade,
      });
    } catch { /* ignore */ }
    handleFailedJob(job, err, 'webhook-outbound');
  }
  logger.error(`Webhook delivery ${job.id} failed`, {
    attempt: job.attemptsMade,
    error: err.message,
  });
});

// ============================================================
// Queue Status API
// ============================================================
export async function getQueueStatus() {
  const [
    aiWaiting, aiActive, aiCompleted, aiFailed, aiDelayed,
    wfWaiting, wfActive, wfCompleted, wfFailed, wfDelayed,
    nWaiting, nActive, nCompleted, nFailed,
    whWaiting, whActive, whCompleted, whFailed,
    dlqCount,
  ] = await Promise.all([
    aiQueue.getWaitingCount(),
    aiQueue.getActiveCount(),
    aiQueue.getCompletedCount(),
    aiQueue.getFailedCount(),
    aiQueue.getDelayedCount(),
    workflowQueue.getWaitingCount(),
    workflowQueue.getActiveCount(),
    workflowQueue.getCompletedCount(),
    workflowQueue.getFailedCount(),
    workflowQueue.getDelayedCount(),
    notificationQueue.getWaitingCount(),
    notificationQueue.getActiveCount(),
    notificationQueue.getCompletedCount(),
    notificationQueue.getFailedCount(),
    webhookOutboundQueue.getWaitingCount(),
    webhookOutboundQueue.getActiveCount(),
    webhookOutboundQueue.getCompletedCount(),
    webhookOutboundQueue.getFailedCount(),
    deadLetterQueue.getWaitingCount(),
  ]);

  return {
    ai: { waiting: aiWaiting, active: aiActive, completed: aiCompleted, failed: aiFailed, delayed: aiDelayed },
    workflow: { waiting: wfWaiting, active: wfActive, completed: wfCompleted, failed: wfFailed, delayed: wfDelayed },
    notification: { waiting: nWaiting, active: nActive, completed: nCompleted, failed: nFailed },
    webhookOutbound: {
      waiting: whWaiting,
      active: whActive,
      completed: whCompleted,
      failed: whFailed,
    },
    deadLetter: { count: dlqCount },
    metrics: Array.from(executionMetrics.values()).slice(-20),
    recentFailures: Array.from(failedJobLog.values()).slice(-10),
    redis: redis.status === 'ready' ? 'ready' : redis.status,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// Job Management Functions
// ============================================================
export async function addAIJob(data: any) {
  return aiQueue.add(`ai-${data.agent}-${Date.now()}`, data, {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 * 24, count: 500 },
    removeOnFail: { age: 3600 * 48, count: 200 },
  });
}

export async function addWorkflowJob(data: any) {
  return workflowQueue.add(`wf-${data.workflowName}-${Date.now()}`, data, {
    attempts: 3,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: { age: 3600 * 24, count: 500 },
    removeOnFail: { age: 3600 * 48, count: 200 },
  });
}

export async function addNotification(data: any) {
  return notificationQueue.add(`notif-${data.type}-${Date.now()}`, data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    priority: data.priority || 5,
  });
}

export async function addWebhookDeliveryJob(data: {
  webhookId: string;
  logId: string;
  eventId: string;
  userId: number;
  attempt?: number;
  replay?: boolean;
  manualRetry?: boolean;
}) {
  return webhookOutboundQueue.add(
    `wh-${data.webhookId}-${data.logId}`,
    data,
    {
      jobId: `wh-${data.logId}-${data.attempt || 1}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10000 },
    }
  );
}

export async function getRecentJobs(queueName: string, count: number = 20) {
  const queueMap: Record<string, Queue> = {
    ai: aiQueue,
    workflow: workflowQueue,
    notification: notificationQueue,
    webhookOutbound: webhookOutboundQueue,
    deadLetter: deadLetterQueue,
  };
  const queue = queueMap[queueName] || aiQueue;

  const [completed, failed, waiting] = await Promise.all([
    queue.getCompleted(0, count),
    queue.getFailed(0, count),
    queue.getWaiting(0, count),
  ]);

  return {
    completed: completed.map((j: Job) => ({
      id: j.id,
      name: j.name,
      status: 'completed',
      result: j.returnvalue,
      timestamp: j.timestamp,
      attempts: j.attemptsMade,
      processedOn: j.processedOn,
    })),
    failed: failed.map((j: Job) => ({
      id: j.id,
      name: j.name,
      status: 'failed',
      error: j.failedReason,
      timestamp: j.timestamp,
      attempts: j.attemptsMade,
    })),
    waiting: waiting.map((j: Job) => ({
      id: j.id,
      name: j.name,
      status: 'waiting',
      timestamp: j.timestamp,
      delay: j.delay,
    })),
  };
}

export async function retryDeadLetterJob(jobId: string) {
  const job = await deadLetterQueue.getJob(jobId);
  if (!job) return null;

  const originalData = job.data?.data || job.data;
  const originalQueue = job.data?.originalQueue || 'ai-requests';

  if (originalQueue === 'ai-requests') {
    return addAIJob(originalData);
  } else if (originalQueue === 'workflow-executions') {
    return addWorkflowJob(originalData);
  }
  return null;
}

// ============================================================
// Graceful Shutdown
// ============================================================
export async function closeQueues() {
  logger.info('Closing BullMQ queues and workers...');
  await Promise.all([
    aiWorker.close(),
    workflowWorker.close(),
    notificationWorker.close(),
    webhookOutboundWorker.close(),
  ]);
  await Promise.all([
    aiQueue.close(),
    workflowQueue.close(),
    analyticsQueue.close(),
    shippingQueue.close(),
    notificationQueue.close(),
    webhookOutboundQueue.close(),
    deadLetterQueue.close(),
  ]);
  redis.disconnect();
  logger.info('BullMQ shutdown complete');
}

process.on('SIGTERM', () => closeQueues().then(() => process.exit(0)));
process.on('SIGINT', () => closeQueues().then(() => process.exit(0)));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  closeQueues().then(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});
