import { logger } from '../config/logger';
import { AGENT_EVENT_MAP, PublishEventInput } from '../types/integrations';
import {
  createWebhookLog,
  findSubscribedWebhooks,
  insertWebhookEvent,
  getLogsForEvent,
  getWebhookLog,
  getEventById,
  INTEGRATION_EVENT_TYPES,
} from './integrationsDb';

export { INTEGRATION_EVENT_TYPES };

export function isValidEventType(eventType: string): boolean {
  return (INTEGRATION_EVENT_TYPES as readonly string[]).includes(eventType);
}

export async function publishEvent(input: PublishEventInput) {
  const {
    userId,
    integrationId = null,
    eventType,
    payload,
    source = 'system',
    idempotencyKey,
    triggerAgents = true,
  } = input;

  if (!isValidEventType(eventType)) {
    throw new Error(`Unsupported event type: ${eventType}`);
  }

  const event = await insertWebhookEvent({
    userId,
    integrationId,
    eventType,
    payload,
    source,
    idempotencyKey,
  });

  const webhooks = await findSubscribedWebhooks(userId, eventType);
  const deliveryJobs: string[] = [];
  const { addWebhookDeliveryJob } = require('./queue');

  for (const webhook of webhooks) {
    const log = await createWebhookLog(webhook.id, event.id, userId);
    await addWebhookDeliveryJob({
      webhookId: webhook.id,
      logId: log.id,
      eventId: event.id,
      userId,
      attempt: 1,
    });
    deliveryJobs.push(log.id);
  }

  if (triggerAgents) {
    await triggerAgentForEvent(userId, eventType, payload).catch((err) => {
      logger.warn('Agent trigger failed', { eventType, error: err.message });
    });
  }

  logger.info('Event published', {
    eventId: event.id,
    eventType,
    userId,
    webhookCount: webhooks.length,
  });

  return { event, deliveryCount: webhooks.length, deliveryLogIds: deliveryJobs };
}

async function triggerAgentForEvent(
  userId: number,
  eventType: string,
  payload: Record<string, unknown>
) {
  const mapping = AGENT_EVENT_MAP[eventType];
  if (!mapping) return;

  const { addAIJob, addWorkflowJob } = await import('./queue');
  const prompt =
    eventType.startsWith('order.')
      ? `Process order event ${eventType}: ${JSON.stringify(payload).slice(0, 1500)}`
      : eventType.startsWith('shipment.')
        ? `Track shipment event ${eventType}: ${JSON.stringify(payload).slice(0, 1500)}`
        : `Handle ${eventType}: ${JSON.stringify(payload).slice(0, 1500)}`;

  if (mapping.workflowName) {
    await addWorkflowJob({
      workflowName: mapping.workflowName,
      input: { prompt, eventType, payload },
      trigger: 'integration_event',
      userId: String(userId),
    });
  } else {
    await addAIJob({
      agent: mapping.agent,
      prompt,
      context: { eventType, payload },
      userId: String(userId),
    });
  }
}

export async function replayEvent(eventId: string, userId: number) {
  const event = await getEventById(eventId, userId);
  if (!event) throw new Error('Event not found');

  const webhooks = await findSubscribedWebhooks(userId, event.event_type);
  const replayed: string[] = [];

  const { addWebhookDeliveryJob } = require('./queue');

  for (const webhook of webhooks) {
    const log = await createWebhookLog(webhook.id, event.id, userId);
    await addWebhookDeliveryJob({
      webhookId: webhook.id,
      logId: log.id,
      eventId: event.id,
      userId,
      attempt: 1,
      replay: true,
    });
    replayed.push(log.id);
  }

  return { eventId, replayedCount: replayed.length, logIds: replayed };
}

export async function retryWebhookLog(logId: string, userId: number) {
  const log = await getWebhookLog(logId, userId);
  if (!log) throw new Error('Log not found');
  if (log.status === 'delivered') {
    return { message: 'Already delivered', logId };
  }

  const event = await getEventById(log.event_id, userId);
  if (!event) throw new Error('Event not found');

  const { addWebhookDeliveryJob } = require('./queue');
  await addWebhookDeliveryJob({
    webhookId: log.webhook_id,
    logId: log.id,
    eventId: event.id,
    userId,
    attempt: (log.attempt_count || 0) + 1,
    manualRetry: true,
  });

  return { logId, queued: true };
}

export function mapOrderStatusToEvent(
  previousStatus: string | undefined,
  newStatus: string
): string | null {
  if (!previousStatus && newStatus === 'new') return 'order.created';
  if (previousStatus !== newStatus) {
    if (newStatus === 'confirmed') return 'order.confirmed';
    return 'order.updated';
  }
  return null;
}
