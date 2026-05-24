import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { pool } from '../../config/db_pg';
import {
  findConnectionByVerifyToken,
  getConnectionByPhoneNumberId,
  insertInboundMessage,
  markWebhookVerified,
  recordWebhookEvent,
  updateMessageStatus,
} from './db';
import { isCancellationReplyForUser, isConfirmationReplyForUser } from './codFlow';
import { updateIntegrationOrderStatus } from '../ordersDb';

function validateSignature(rawBody: string, signature: string, appSecret: string): boolean {
  if (!appSecret) return env.NODE_ENV !== 'production';
  try {
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    const sig = signature.replace(/^sha256=/, '');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export async function handleWhatsAppWebhookVerify(
  mode: string,
  token: string,
  challenge: string
): Promise<string | null> {
  if (mode !== 'subscribe' || !token) return null;
  const conn = await findConnectionByVerifyToken(token);
  if (conn) {
    await markWebhookVerified(conn.user_id);
    logger.info('WhatsApp webhook verified for tenant', { userId: conn.user_id });
    return String(challenge);
  }
  if (env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return String(challenge);
  }
  return null;
}

export async function handleWhatsAppWebhookPayload(
  body: Record<string, unknown>,
  rawBody: string,
  signature?: string
): Promise<void> {
  if (signature && env.META_APP_SECRET) {
    if (!validateSignature(rawBody, signature, env.META_APP_SECRET)) {
      logger.error('WhatsApp webhook signature mismatch');
      return;
    }
  }

  const entry = (body.entry as Array<Record<string, unknown>>) || [];
  for (const e of entry) {
    const changes = (e.changes as Array<Record<string, unknown>>) || [];
    for (const change of changes) {
      const value = (change.value as Record<string, unknown>) || {};
      const metadata = value.metadata as { phone_number_id?: string } | undefined;
      const phoneNumberId = String(metadata?.phone_number_id || '');
      const conn = phoneNumberId ? await getConnectionByPhoneNumberId(phoneNumberId) : null;
      const userId = conn?.user_id;

      const statuses = (value.statuses as Array<Record<string, unknown>>) || [];
      for (const st of statuses) {
        const eventId = `status-${st.id}-${st.status}-${st.timestamp || ''}`;
        const inserted = await recordWebhookEvent({
          eventId,
          userId,
          phoneNumberId,
          eventType: `status.${st.status}`,
          payload: st as Record<string, unknown>,
        });
        if (!inserted) continue;
        const waId = String(st.id || '');
        const status = String(st.status || '');
        if (waId) await updateMessageStatus(waId, status);
      }

      const messages = (value.messages as Array<Record<string, unknown>>) || [];
      for (const message of messages) {
        const eventId = `msg-${message.id}`;
        const inserted = await recordWebhookEvent({
          eventId,
          userId,
          phoneNumberId,
          eventType: 'message.inbound',
          payload: message as Record<string, unknown>,
        });
        if (!inserted || !userId) continue;

        const from = String(message.from || '');
        const text =
          (message.text as { body?: string })?.body ||
          (message.button as { text?: string })?.text ||
          '';

        await insertInboundMessage({
          userId,
          senderPhone: from,
          waMessageId: String(message.id),
          bodyPreview: text.slice(0, 500),
          payload: message as Record<string, unknown>,
        });

        if (text && conn) {
          await processInboundReply(userId, from, text);
        }
      }
    }
  }
}

async function processInboundReply(userId: number, fromPhone: string, text: string) {
  const digits = fromPhone.replace(/\D/g, '');
  const r = await pool.query(
    `SELECT id, integration_id FROM integration_orders
     WHERE user_id = $1 AND status = 'pending_confirmation'::public_order_status
     AND REPLACE(REPLACE(customer_phone, ' ', ''), '+', '') LIKE $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, `%${digits.slice(-10)}%`]
  );
  const row = r.rows[0];
  if (!row) return;

  const orderId = row.id as string;
  const integrationId = Number(row.integration_id);

  if (await isConfirmationReplyForUser(userId, text)) {
    await updateIntegrationOrderStatus(userId, orderId, integrationId, 'confirmed', {
      notes: 'Confirmed via WhatsApp',
      changedBy: 'whatsapp_inbound',
      source: 'whatsapp',
    });
    logger.info('Order confirmed via WhatsApp', { userId, orderId });
  } else if (await isCancellationReplyForUser(userId, text)) {
    await updateIntegrationOrderStatus(userId, orderId, integrationId, 'cancelled', {
      notes: 'Cancelled via WhatsApp',
      changedBy: 'whatsapp_inbound',
      source: 'whatsapp',
    });
  }
}
