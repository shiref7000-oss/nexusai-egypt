import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { withTimeout } from '../../utils/queryTimeout';
import { extractGraphError } from './graphClient';
import {
  getAccessToken,
  getConnectionByUserId,
  listTemplates,
  markTemplateSyncTime,
  updateConnectionProfile,
  updateTemplateStatus,
} from './db';
import { WHATSAPP_TEMPLATE_CATALOG } from './templateCatalog';

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v21.0'}`;
const SYNC_TIMEOUT_MS = 25000;

export type RemoteTemplate = {
  name: string;
  status: string;
  language: string;
  category?: string;
  rejected_reason?: string;
};

export type WhatsAppSyncResult = {
  templatesUpdated: number;
  templatesTotal: number;
  remoteTemplateCount: number;
  phoneUpdated: boolean;
  unmatchedLocal: string[];
  remoteTemplates: Array<{ name: string; status: string; language: string }>;
  message: string;
  _timingMs: number;
};

/** Map Meta template status to NexusAI UI status. */
export function mapMetaTemplateStatus(metaStatus: string): 'approved' | 'pending' | 'rejected' {
  const s = metaStatus.toUpperCase();
  if (s === 'APPROVED') return 'approved';
  if (s === 'REJECTED') return 'rejected';
  return 'pending';
}

export async function listAllMessageTemplates(
  accessToken: string,
  wabaId: string
): Promise<RemoteTemplate[]> {
  const all: RemoteTemplate[] = [];
  let url: string | null = `${GRAPH}/${wabaId}/message_templates`;
  let guard = 0;

  while (url && guard < 20) {
    guard++;
    const { data } = await axios.get(url, {
      params: guard === 1 ? { limit: 100, fields: 'name,status,language,category,rejected_reason' } : undefined,
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000,
    });
    const batch = (data?.data || []).map((t: Record<string, unknown>) => ({
      name: String(t.name),
      status: String(t.status),
      language: String((t.language as string) || 'ar'),
      category: t.category as string | undefined,
      rejected_reason: t.rejected_reason as string | undefined,
    }));
    all.push(...batch);
    const next = data?.paging?.next as string | undefined;
    url = next || null;
  }

  return all;
}

function findRemoteForLocal(
  remote: RemoteTemplate[],
  metaName: string | null,
  defaultMetaName?: string
): RemoteTemplate | undefined {
  const candidates = [metaName, defaultMetaName]
    .filter(Boolean)
    .map((n) => String(n).toLowerCase());
  if (candidates.length === 0) return undefined;
  return remote.find((r) => candidates.includes(r.name.toLowerCase()));
}

export async function syncConnectionPhoneFromMeta(
  userId: number,
  accessToken: string,
  wabaId: string,
  phoneNumberId: string
): Promise<boolean> {
  const { data } = await axios.get(`${GRAPH}/${wabaId}/phone_numbers`, {
    params: { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status' },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  const phones = (data?.data || []) as Array<Record<string, unknown>>;
  const match =
    phones.find((p) => String(p.id) === phoneNumberId) ||
    phones.find((p) => String(p.id) === String(phoneNumberId)) ||
    phones[0];
  if (!match) return false;

  await updateConnectionProfile(userId, {
    displayPhone: match.display_phone_number as string | undefined,
    businessName: match.verified_name as string | undefined,
    phoneNumberId: match.id ? String(match.id) : phoneNumberId,
  });
  return true;
}

export async function syncWhatsAppFromMeta(userId: number): Promise<WhatsAppSyncResult> {
  const started = Date.now();
  const conn = await getConnectionByUserId(userId);
  if (!conn || conn.status !== 'connected' || !conn.waba_id || !conn.phone_number_id) {
    throw new Error('WhatsApp not connected');
  }

  const accessToken = getAccessToken(conn);
  if (!accessToken) {
    throw new Error('WhatsApp access token missing — reconnect WhatsApp');
  }

  let phoneUpdated = false;
  try {
    phoneUpdated = await syncConnectionPhoneFromMeta(
      userId,
      accessToken,
      conn.waba_id,
      conn.phone_number_id
    );
  } catch (err: unknown) {
    logger.warn('WhatsApp phone sync failed', { userId, error: extractGraphError(err) });
  }

  const remote = await listAllMessageTemplates(accessToken, conn.waba_id);
  const local = await listTemplates(userId);
  let templatesUpdated = 0;
  const unmatchedLocal: string[] = [];

  for (const row of local) {
    const key = row.template_key as string;
    const catalog = WHATSAPP_TEMPLATE_CATALOG.find((c) => c.key === key);
    const metaName = (row.meta_template_name as string) || null;
    const match = findRemoteForLocal(remote, metaName, catalog?.defaultMetaName);
    if (!match) {
      unmatchedLocal.push(key);
      continue;
    }
    const status = mapMetaTemplateStatus(match.status);
    await updateTemplateStatus(userId, key, status, match.status, match.rejected_reason);
    templatesUpdated++;
  }

  await markTemplateSyncTime(userId);

  const ms = Date.now() - started;
  const message =
    templatesUpdated > 0 || phoneUpdated
      ? `Synced from Meta: ${templatesUpdated} template(s) updated${phoneUpdated ? ', phone profile refreshed' : ''}.`
      : remote.length === 0
        ? 'No templates returned from Meta — check WABA permissions.'
        : `Fetched ${remote.length} Meta template(s); map catalog names to your approved template names if statuses did not change.`;

  logger.info('WhatsApp sync from Meta complete', {
    userId,
    ms,
    templatesUpdated,
    remoteCount: remote.length,
    phoneUpdated,
  });

  return {
    templatesUpdated,
    templatesTotal: local.length,
    remoteTemplateCount: remote.length,
    phoneUpdated,
    unmatchedLocal,
    remoteTemplates: remote.map((t) => ({ name: t.name, status: t.status, language: t.language })),
    message,
    _timingMs: ms,
  };
}

export async function runSyncWithTimeout(userId: number): Promise<WhatsAppSyncResult> {
  try {
    return await withTimeout(syncWhatsAppFromMeta(userId), SYNC_TIMEOUT_MS, 'syncWhatsAppFromMeta');
  } catch (err: unknown) {
    const msg = extractGraphError(err);
    logger.error('WhatsApp sync failed', { userId, error: msg });
    throw new Error(msg);
  }
}
