import { logger } from '../config/logger';
import { publishEvent } from './integrationEvents';

export function mapV1OrderStatusToEvent(
  previousStatus: string | undefined,
  newStatus: string
): string | null {
  if (!previousStatus) return 'order.created';
  if (previousStatus === newStatus) return null;
  if (newStatus === 'confirmed') return 'order.confirmed';
  return 'order.updated';
}

export async function emitOrderWebhookEvent(opts: {
  userId: number;
  integrationId: number;
  eventType: string;
  order: Record<string, unknown>;
  previousStatus?: string;
  idempotencyKey?: string;
}) {
  const { userId, integrationId, eventType, order, previousStatus, idempotencyKey } = opts;
  try {
    await publishEvent({
      userId,
      integrationId,
      eventType,
      payload: { order, previousStatus },
      source: 'public_orders_api',
      idempotencyKey:
        idempotencyKey ||
        `${eventType}-${order.id}-${order.updated_at || order.created_at}`,
      triggerAgents: false,
    });
  } catch (err: any) {
    logger.error('Order webhook event failed', {
      eventType,
      orderId: order.id,
      error: err.message,
    });
    throw err;
  }
}
