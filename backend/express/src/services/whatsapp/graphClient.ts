import axios, { type AxiosError } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { withTimeout } from '../../utils/queryTimeout';

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v21.0'}`;
const GRAPH_TIMEOUT_MS = parseInt(process.env.WHATSAPP_GRAPH_TIMEOUT_MS || '12000', 10);

export function extractGraphError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ error?: { message?: string; error_user_msg?: string } }>;
    const msg = ax.response?.data?.error?.message || ax.response?.data?.error?.error_user_msg;
    if (msg) return msg;
    if (ax.code === 'ECONNABORTED') return `Meta API timed out after ${GRAPH_TIMEOUT_MS}ms`;
    return ax.message || 'Meta API request failed';
  }
  return err instanceof Error ? err.message : 'Meta API request failed';
}

type PhoneProfile = {
  displayPhone?: string;
  verifiedName?: string;
  resolvedPhoneNumberId?: string;
  hint?: string;
};

async function graphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  label: string
): Promise<T> {
  return withTimeout(
    axios
      .get(`${GRAPH}/${path}`, {
        params,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: GRAPH_TIMEOUT_MS,
      })
      .then((r) => r.data as T),
    GRAPH_TIMEOUT_MS + 2000,
    label
  );
}

function isFieldAccessError(message: string): boolean {
  return /nonexisting field|unsupported get|does not exist|cannot be loaded/i.test(message);
}

/** Verify token + ID. Accepts Phone Number ID or WABA ID (common setup mistake). */
export async function verifyWhatsAppCredentials(input: {
  accessToken: string;
  phoneNumberId: string;
  wabaId?: string;
}): Promise<PhoneProfile> {
  const id = input.phoneNumberId.trim();
  const token = input.accessToken;
  const fieldSets = [
    'id,display_phone_number,verified_name,quality_rating',
    'id,verified_name,quality_rating',
    'id',
  ];

  for (const fields of fieldSets) {
    try {
      const data = await graphGet<Record<string, unknown>>(
        id,
        { fields },
        token,
        `verifyWhatsAppPhoneFields:${fields}`
      );
      if (data.id || data.display_phone_number || data.verified_name) {
        return {
          displayPhone: data.display_phone_number as string | undefined,
          verifiedName: data.verified_name as string | undefined,
          resolvedPhoneNumberId: String(data.id || id),
        };
      }
    } catch (err: unknown) {
      const message = extractGraphError(err);
      if (!isFieldAccessError(message)) {
        logger.warn('WhatsApp credential verify failed', { id, fields, error: message });
        throw new Error(message);
      }
      logger.info('WhatsApp verify retrying with fewer fields', { id, fields, error: message });
    }
  }

  const wabaCandidates = [input.wabaId?.trim(), id].filter(Boolean) as string[];
  for (const wabaId of wabaCandidates) {
    try {
      const list = await graphGet<{ data?: Array<Record<string, unknown>> }>(
        `${wabaId}/phone_numbers`,
        { fields: 'id,display_phone_number,verified_name,quality_rating' },
        token,
        'verifyWhatsAppViaWabaPhoneNumbers'
      );
      const phones = list.data || [];
      if (phones.length === 0) continue;

      const match = phones.find((p) => String(p.id) === id) || phones[0];
      const usedWabaNotPhone = wabaId === id;
      return {
        displayPhone: match.display_phone_number as string | undefined,
        verifiedName: match.verified_name as string | undefined,
        resolvedPhoneNumberId: String(match.id),
        hint: usedWabaNotPhone
          ? 'You entered a WABA ID — use the Phone Number ID from Meta → WhatsApp → API Setup, or connect with this WABA’s first number.'
          : phones.length > 1
            ? 'Verified via WABA phone list.'
            : undefined,
      };
    } catch (err: unknown) {
      const message = extractGraphError(err);
      if (!isFieldAccessError(message) && !message.includes('(#100)')) {
        logger.warn('WhatsApp WABA phone_numbers verify failed', { wabaId, error: message });
      }
    }
  }

  throw new Error(
    'Could not verify this ID. In Meta Developer → WhatsApp → API Setup, copy the Phone number ID (numeric), not the WhatsApp Business Account ID (WABA).'
  );
}

export async function sendTemplateMessage(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: string[];
}): Promise<{ messageId: string }> {
  const to = input.to.replace(/\D/g, '');
  const components =
    input.bodyParameters && input.bodyParameters.length > 0
      ? [
          {
            type: 'body',
            parameters: input.bodyParameters.map((text) => ({ type: 'text', text: String(text) })),
          },
        ]
      : undefined;

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode || 'ar' },
      ...(components ? { components } : {}),
    },
  };

  const url = `${GRAPH}/${input.phoneNumberId}/messages`;
  const { data } = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });

  const messageId = data?.messages?.[0]?.id;
  if (!messageId) {
    throw new Error(data?.error?.message || 'WhatsApp send returned no message id');
  }
  return { messageId };
}

export async function sendTextMessage(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<{ messageId: string }> {
  const to = input.to.replace(/\D/g, '');
  const url = `${GRAPH}/${input.phoneNumberId}/messages`;
  const { data } = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: input.text },
    },
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );
  const messageId = data?.messages?.[0]?.id;
  if (!messageId) throw new Error(data?.error?.message || 'WhatsApp text send failed');
  return { messageId };
}

export async function listMessageTemplates(input: {
  accessToken: string;
  wabaId: string;
}): Promise<
  Array<{ name: string; status: string; language: string; category?: string; rejected_reason?: string }>
> {
  const url = `${GRAPH}/${input.wabaId}/message_templates`;
  const { data } = await axios.get(url, {
    params: { limit: 100 },
    headers: { Authorization: `Bearer ${input.accessToken}` },
    timeout: 20000,
  });
  return (data?.data || []).map((t: Record<string, unknown>) => ({
    name: String(t.name),
    status: String(t.status),
    language: String((t.language as string) || 'ar'),
    category: t.category as string | undefined,
    rejected_reason: t.rejected_reason as string | undefined,
  }));
}

/** @deprecated Use syncWhatsAppFromMeta from metaSync.ts */
export async function syncTemplatesFromMeta(userId: number, accessToken: string, wabaId: string) {
  const { syncWhatsAppFromMeta } = await import('./metaSync');
  void accessToken;
  void wabaId;
  await syncWhatsAppFromMeta(userId);
}
