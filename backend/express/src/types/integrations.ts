export const INTEGRATION_EVENT_TYPES = [
  'order.created',
  'order.updated',
  'order.confirmed',
  'shipment.created',
  'shipment.delivered',
  'payment.failed',
  'customer.created',
] as const;

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];

export const AGENT_EVENT_MAP: Record<string, { agent: string; workflowName?: string }> = {
  'order.created': { agent: 'support', workflowName: 'Order Confirmation' },
  'order.updated': { agent: 'ceo', workflowName: 'Analytics' },
  'order.confirmed': { agent: 'support', workflowName: 'Order Confirmation' },
  'shipment.created': { agent: 'shipping', workflowName: 'Shipping Tracking' },
  'shipment.delivered': { agent: 'shipping', workflowName: 'Shipping Tracking' },
  'payment.failed': { agent: 'support', workflowName: 'Customer Support' },
  'customer.created': { agent: 'support', workflowName: 'Customer Support' },
};

export interface PublishEventInput {
  userId: number;
  integrationId?: number | null;
  eventType: IntegrationEventType | string;
  payload: Record<string, unknown>;
  source?: string;
  idempotencyKey?: string;
  triggerAgents?: boolean;
}
