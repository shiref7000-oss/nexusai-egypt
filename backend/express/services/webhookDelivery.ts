import crypto from 'crypto';
import { logger } from '../config/logger';
import {
  getWebhookById,
  updateWebhookLog,
} from './integrationsDb';

const DELIVERY_TIMEOUT_MS = 15000;

export function signPayload(payload: string, secret: string, timestamp: number): string {
  const signed = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signed).digest('hex');
}

export function verifyInboundSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  maxAgeSec = 300
): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',');
  let timestamp = 0;
  let sig = '';
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = parseInt(v, 10);
    if (k === 'v1') sig = v;
  }
  if (!timestamp || !sig) {
    const legacy = signatureHeader.replace(/^sha256=/, '');
    if (legacy.length === 64) {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(expected));
    }
    return false;
  }
  if (Math.abs(Date.now() / 1000 - timestamp) > maxAgeSec) return false;
  const expected = signPayload(rawBody, secret, timestamp);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export interface DeliveryResult {
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  durationMs: number;
}

export async function deliverWebhook(
  webhookId: string,
  logId: string,
  event: { id: string; event_type: string; payload: unknown; created_at: string }
): Promise<DeliveryResult> {
  const webhook = await getWebhookById(webhookId);
  if (!webhook || !webhook.enabled) {
    return { success: false, errorMessage: 'Webhook disabled or not found', durationMs: 0 };
  }

  const body = JSON.stringify({
    id: event.id,
    type: event.event_type,
    created_at: event.created_at,
    data: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(body, webhook.secret, timestamp);

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusAI-Webhooks/1.0',
        'X-Nexus-Event': event.event_type,
        'X-Nexus-Delivery': logId,
        'X-Nexus-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: controller.signal,
    });

    const durationMs = Date.now() - start;
    const responseBody = await res.text().catch(() => '');
    const success = res.status >= 200 && res.status < 300;

    await updateWebhookLog(logId, {
      status: success ? 'delivered' : 'failed',
      attemptCount: undefined,
      httpStatus: res.status,
      responseBody,
      errorMessage: success ? undefined : `HTTP ${res.status}`,
      durationMs,
      deliveredAt: success ? new Date() : null,
      nextRetryAt: success ? null : new Date(Date.now() + 60000),
    });

    logger.info('Webhook delivered', {
      webhookId,
      logId,
      eventType: event.event_type,
      httpStatus: res.status,
      durationMs,
    });

    return { success, httpStatus: res.status, responseBody, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errorMessage = err.name === 'AbortError' ? 'Delivery timeout' : err.message;

    await updateWebhookLog(logId, {
      status: 'failed',
      errorMessage,
      durationMs,
      nextRetryAt: new Date(Date.now() + 60000),
    });

    logger.warn('Webhook delivery failed', { webhookId, logId, error: errorMessage });
    return { success: false, errorMessage, durationMs };
  } finally {
    clearTimeout(timer);
  }
}
