import { createIntegrationOrder } from './ordersDb';
import {
  normalizeIncomingOrderPayload,
  previewPayload,
  storePayload,
} from './orderPayloadNormalizer';
import { logIncomingWebhook } from './incomingWebhookLogs';

export function buildSampleIncomingOrderPayload(): Record<string, unknown> {
  const ts = Date.now();
  return {
    external_id: `test-${ts}`,
    customer_name: 'NexusAI Test Customer',
    phone: '01000000099',
    city: 'Cairo',
    products: [{ name: 'Test Product', quantity: 1, price: 99 }],
    cod_amount: 99,
    currency: 'EGP',
    status: 'new',
    notes: 'Sent from Integrations page — Send Test Order',
    idempotency_key: `dashboard-test-${ts}`,
  };
}

export type IngestIncomingOrderResult =
  | {
      ok: true;
      httpStatus: number;
      order: Record<string, unknown>;
      created: boolean;
      payloadPreview: Record<string, unknown>;
    }
  | {
      ok: false;
      httpStatus: number;
      error: string;
      code: string;
      details?: string[];
      payloadPreview: Record<string, unknown>;
    };

export async function ingestIncomingOrder(input: {
  userId: number;
  integrationId: number;
  body: Record<string, unknown>;
  clientIp?: string | null;
}): Promise<IngestIncomingOrderResult> {
  const payloadPreview = previewPayload(input.body);
  const rawPayload = storePayload(input.body);
  const ip = input.clientIp || null;

  const normalized = normalizeIncomingOrderPayload(input.body);
  if (!normalized.ok) {
    await logIncomingWebhook({
      userId: input.userId,
      integrationId: input.integrationId,
      status: 'failed',
      httpStatus: 400,
      payloadPreview,
      rawPayload,
      errorMessage: 'Validation failed',
      validationErrors: normalized.errors,
      clientIp: ip,
    });
    return {
      ok: false,
      httpStatus: 400,
      error: 'Invalid order payload',
      code: 'VALIDATION_FAILED',
      details: normalized.errors,
      payloadPreview,
    };
  }

  const o = normalized.order;
  try {
    const { order, created } = await createIntegrationOrder({
      userId: input.userId,
      integrationId: input.integrationId,
      externalId: o.externalId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerCity: o.customerCity,
      customerEmail: o.customerEmail,
      products: o.products,
      codAmount: o.codAmount,
      currency: o.currency,
      status: o.status,
      notes: o.notes,
      idempotencyKey: o.idempotencyKey,
      rawPayload: rawPayload || undefined,
      changedBy: 'incoming_webhook',
      historySource: 'webhook',
    });

    const httpStatus = created ? 201 : 200;
    await logIncomingWebhook({
      userId: input.userId,
      integrationId: input.integrationId,
      status: 'success',
      httpStatus,
      payloadPreview,
      rawPayload,
      orderId: order.id as string,
      clientIp: ip,
    });

    return {
      ok: true,
      httpStatus,
      order: order as Record<string, unknown>,
      created,
      payloadPreview,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create order';
    await logIncomingWebhook({
      userId: input.userId,
      integrationId: input.integrationId,
      status: 'failed',
      httpStatus: 500,
      payloadPreview,
      rawPayload,
      errorMessage: message,
      clientIp: ip,
    });
    return {
      ok: false,
      httpStatus: 500,
      error: 'Unable to process order',
      code: 'ORDER_CREATE_FAILED',
      payloadPreview,
    };
  }
}
