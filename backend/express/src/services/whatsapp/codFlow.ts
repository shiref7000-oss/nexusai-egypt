/**
 * COD confirmation — rules → template → queue (never direct AI send).
 */
import { logger } from '../../config/logger';
import { getConnectionByUserId, getSettingsForUser, listTemplates } from './db';
import { matchesKeyword } from './settings';
import { addWhatsAppOutboundJob } from './queue';

export async function enqueueCodConfirmation(input: {
  userId: number;
  orderId: string;
  customerPhone: string;
  customerName: string;
  externalId: string;
  codAmount: number;
  currency?: string;
}): Promise<{ queued: boolean; reason?: string }> {
  const conn = await getConnectionByUserId(input.userId);
  const settings = await getSettingsForUser(input.userId);
  if (!conn || conn.status !== 'connected' || !conn.cod_flow_enabled || !settings.codEnabled) {
    return { queued: false, reason: 'whatsapp_not_connected' };
  }

  const templates = await listTemplates(input.userId);
  const codTpl = templates.find((t) => t.template_key === settings.codTemplateKey);
  if (!codTpl) return { queued: false, reason: 'template_missing' };
  if (codTpl.status !== 'approved') {
    logger.info('COD WhatsApp skipped — template not approved', { userId: input.userId });
    return { queued: false, reason: 'template_not_approved' };
  }

  const phone = normalizeEgyptPhone(input.customerPhone);
  if (!phone) return { queued: false, reason: 'invalid_phone' };

  await addWhatsAppOutboundJob(
    {
      userId: input.userId,
      orderId: input.orderId,
      templateKey: settings.codTemplateKey,
      recipientPhone: phone,
      templateName: codTpl.meta_template_name as string,
      bodyParameters: [
        input.customerName || 'عميل',
        input.externalId,
        `${input.codAmount} ${input.currency || 'EGP'}`,
      ],
    },
    { delayMs: settings.codDelaySeconds * 1000 }
  );

  return { queued: true };
}

function normalizeEgyptPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `20${digits.slice(1)}`;
  if (digits.length === 10) return `20${digits}`;
  return null;
}

export async function isConfirmationReplyForUser(userId: number, text: string): Promise<boolean> {
  const settings = await getSettingsForUser(userId);
  return matchesKeyword(text, settings.confirmKeywords);
}

export async function isCancellationReplyForUser(userId: number, text: string): Promise<boolean> {
  const settings = await getSettingsForUser(userId);
  return matchesKeyword(text, settings.cancelKeywords);
}
