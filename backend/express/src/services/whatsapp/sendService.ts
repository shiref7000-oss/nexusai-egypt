/**
 * Outbound WhatsApp — queue-only. Never call Graph API directly from HTTP handlers.
 */
import { logger } from '../../config/logger';
import {
  getAccessToken,
  getConnectionByUserId,
  insertOutboundMessage,
  updateMessageStatus,
} from './db';
import { sendTemplateMessage, sendTextMessage } from './graphClient';
import { pool } from '../../config/db_pg';

export type WhatsAppOutboundJob = {
  userId: number;
  orderId?: string;
  templateKey?: string;
  recipientPhone: string;
  templateName?: string;
  bodyParameters?: string[];
  textBody?: string;
  messageRecordId?: string;
};

export async function processWhatsAppOutboundJob(job: WhatsAppOutboundJob): Promise<Record<string, unknown>> {
  const conn = await getConnectionByUserId(job.userId);
  if (!conn || conn.status !== 'connected' || !conn.phone_number_id) {
    throw new Error('WhatsApp not connected for user');
  }

  const token = getAccessToken(conn);
  if (!token) throw new Error('Missing WhatsApp access token');

  let record = job.messageRecordId
    ? { id: job.messageRecordId }
    : await insertOutboundMessage({
        userId: job.userId,
        orderId: job.orderId,
        templateKey: job.templateKey,
        recipientPhone: job.recipientPhone,
        bodyPreview: job.textBody || `template:${job.templateName}`,
        payload: job,
      });

  const start = Date.now();
  try {
    let messageId: string;
    if (job.templateName) {
      const result = await sendTemplateMessage({
        accessToken: token,
        phoneNumberId: conn.phone_number_id,
        to: job.recipientPhone,
        templateName: job.templateName,
        bodyParameters: job.bodyParameters,
      });
      messageId = result.messageId;
    } else if (job.textBody) {
      const result = await sendTextMessage({
        accessToken: token,
        phoneNumberId: conn.phone_number_id,
        to: job.recipientPhone,
        text: job.textBody,
      });
      messageId = result.messageId;
    } else {
      throw new Error('Job requires templateName or textBody');
    }

    await pool.query(
      `UPDATE whatsapp_messages SET wa_message_id = $2, status = 'sent', sent_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [record.id, messageId]
    );

    if (job.orderId) {
      await pool.query(
        `UPDATE integration_orders SET status = 'pending_confirmation'::public_order_status, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'new'::public_order_status`,
        [job.orderId, job.userId]
      );
    }

    logger.info('WhatsApp message sent', {
      userId: job.userId,
      orderId: job.orderId,
      messageId,
      ms: Date.now() - start,
    });
    return { success: true, messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE whatsapp_messages SET status = 'failed', failed_at = NOW(), error_message = $2, updated_at = NOW()
       WHERE id = $1`,
      [record.id, msg.slice(0, 500)]
    );
    if (job.messageRecordId) {
      await updateMessageStatus(String(job.messageRecordId), 'failed', { errorMessage: msg });
    }
    throw err;
  }
}
