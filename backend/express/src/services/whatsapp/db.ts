import { pool } from '../../config/db_pg';
import { encryptSecret, decryptSecret, hashWebhookVerifyToken } from './encryption';
import { WHATSAPP_TEMPLATE_CATALOG } from './templateCatalog';
import { DEFAULT_WHATSAPP_SETTINGS, parseSettings, type WhatsAppSettings } from './settings';

export type WhatsAppConnectionRow = {
  id: number;
  user_id: number;
  meta_app_id: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone: string | null;
  business_name: string | null;
  access_token_enc: string;
  webhook_verified_at: Date | null;
  status: string;
  last_error: string | null;
  cod_flow_enabled: boolean;
  settings?: unknown;
  last_template_sync_at?: Date | null;
};

export function connectionPublicView(row: WhatsAppConnectionRow | null) {
  if (!row) {
    return {
      connected: false,
      status: 'disconnected',
      metaAppId: null,
      wabaId: null,
      phoneNumberId: null,
      displayPhone: null,
      businessName: null,
      webhookVerified: false,
      webhookVerifiedAt: null,
      codFlowEnabled: true,
      lastError: null,
      settings: DEFAULT_WHATSAPP_SETTINGS,
      lastTemplateSyncAt: null,
    };
  }
  const settings = parseSettings(row.settings);
  return {
    connected: row.status === 'connected' && !!row.phone_number_id,
    status: row.status,
    metaAppId: row.meta_app_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id ? maskId(row.phone_number_id) : null,
    displayPhone: row.display_phone,
    businessName: row.business_name,
    webhookVerified: !!row.webhook_verified_at,
    webhookVerifiedAt: row.webhook_verified_at,
    codFlowEnabled: row.cod_flow_enabled && settings.codEnabled,
    lastError: row.last_error,
    settings,
    lastTemplateSyncAt: row.last_template_sync_at || null,
  };
}

export async function getSettingsForUser(userId: number): Promise<WhatsAppSettings> {
  const conn = await getConnectionByUserId(userId);
  return conn ? parseSettings(conn.settings) : { ...DEFAULT_WHATSAPP_SETTINGS };
}

export async function updateSettingsForUser(userId: number, patch: Partial<WhatsAppSettings>): Promise<WhatsAppSettings> {
  const current = await getSettingsForUser(userId);
  const next = { ...current, ...patch };
  await pool.query(
    `UPDATE whatsapp_connections SET
      settings = $2::jsonb,
      cod_flow_enabled = $3,
      updated_at = NOW()
     WHERE user_id = $1`,
    [userId, JSON.stringify(next), next.codEnabled]
  );
  return next;
}

export async function updateTemplateMapping(
  userId: number,
  templateKey: string,
  metaTemplateName: string
) {
  await pool.query(
    `UPDATE whatsapp_templates SET meta_template_name = $3, updated_at = NOW()
     WHERE user_id = $1 AND template_key = $2`,
    [userId, templateKey, metaTemplateName]
  );
}

export async function markTemplateSyncTime(userId: number) {
  await pool.query(
    `UPDATE whatsapp_connections SET last_template_sync_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function updateConnectionProfile(
  userId: number,
  patch: { displayPhone?: string; businessName?: string; phoneNumberId?: string }
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [userId];
  if (patch.displayPhone !== undefined) {
    params.push(patch.displayPhone);
    sets.push(`display_phone = $${params.length}`);
  }
  if (patch.businessName !== undefined) {
    params.push(patch.businessName);
    sets.push(`business_name = $${params.length}`);
  }
  if (patch.phoneNumberId !== undefined) {
    params.push(patch.phoneNumberId);
    sets.push(`phone_number_id = $${params.length}`);
  }
  await pool.query(
    `UPDATE whatsapp_connections SET ${sets.join(', ')} WHERE user_id = $1`,
    params
  );
}

function maskId(id: string): string {
  if (id.length <= 8) return '****';
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export async function getConnectionByUserId(userId: number): Promise<WhatsAppConnectionRow | null> {
  const r = await pool.query('SELECT * FROM whatsapp_connections WHERE user_id = $1', [userId]);
  return (r.rows[0] as WhatsAppConnectionRow) || null;
}

export async function getConnectionByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppConnectionRow | null> {
  const r = await pool.query('SELECT * FROM whatsapp_connections WHERE phone_number_id = $1', [
    phoneNumberId,
  ]);
  return (r.rows[0] as WhatsAppConnectionRow) || null;
}

export async function findConnectionByVerifyToken(verifyToken: string): Promise<WhatsAppConnectionRow | null> {
  const hash = hashWebhookVerifyToken(verifyToken);
  const r = await pool.query(
    'SELECT * FROM whatsapp_connections WHERE webhook_verify_token_hash = $1',
    [hash]
  );
  return (r.rows[0] as WhatsAppConnectionRow) || null;
}

export async function upsertConnection(input: {
  userId: number;
  metaAppId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone?: string;
  businessName?: string;
  accessToken: string;
  webhookVerifyToken: string;
}): Promise<WhatsAppConnectionRow> {
  const tokenEnc = encryptSecret(input.accessToken);
  const verifyHash = hashWebhookVerifyToken(input.webhookVerifyToken);
  const r = await pool.query(
    `INSERT INTO whatsapp_connections (
      user_id, meta_app_id, waba_id, phone_number_id, display_phone, business_name,
      access_token_enc, webhook_verify_token_hash, status, last_error, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'connected', NULL, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      meta_app_id = EXCLUDED.meta_app_id,
      waba_id = EXCLUDED.waba_id,
      phone_number_id = EXCLUDED.phone_number_id,
      display_phone = EXCLUDED.display_phone,
      business_name = EXCLUDED.business_name,
      access_token_enc = EXCLUDED.access_token_enc,
      webhook_verify_token_hash = EXCLUDED.webhook_verify_token_hash,
      status = 'connected',
      last_error = NULL,
      updated_at = NOW()
    RETURNING *`,
    [
      input.userId,
      input.metaAppId,
      input.wabaId,
      input.phoneNumberId,
      input.displayPhone || null,
      input.businessName || null,
      tokenEnc,
      verifyHash,
    ]
  );
  await seedDefaultTemplates(input.userId);
  return r.rows[0] as WhatsAppConnectionRow;
}

export async function markWebhookVerified(userId: number): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_connections SET webhook_verified_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function disconnectWhatsApp(userId: number): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_connections SET
      status = 'disconnected',
      phone_number_id = NULL,
      display_phone = NULL,
      access_token_enc = '',
      webhook_verify_token_hash = NULL,
      webhook_verified_at = NULL,
      updated_at = NOW()
    WHERE user_id = $1`,
    [userId]
  );
}

export async function setConnectionError(userId: number, message: string): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_connections SET status = 'error', last_error = $2, updated_at = NOW() WHERE user_id = $1`,
    [userId, message.slice(0, 500)]
  );
}

export function getAccessToken(row: WhatsAppConnectionRow): string {
  if (!row.access_token_enc) return '';
  return decryptSecret(row.access_token_enc);
}

export async function seedDefaultTemplates(userId: number): Promise<void> {
  for (const t of WHATSAPP_TEMPLATE_CATALOG) {
    await pool.query(
      `INSERT INTO whatsapp_templates (user_id, template_key, meta_template_name, language_code, category, status, components)
       VALUES ($1, $2, $3, 'ar', $4, 'pending', $5::jsonb)
       ON CONFLICT (user_id, template_key) DO NOTHING`,
      [
        userId,
        t.key,
        t.defaultMetaName,
        t.category,
        JSON.stringify([{ type: 'BODY', text: t.sampleBody }]),
      ]
    );
  }
}

export async function listTemplates(userId: number) {
  const r = await pool.query(
    'SELECT * FROM whatsapp_templates WHERE user_id = $1 ORDER BY template_key',
    [userId]
  );
  return r.rows;
}

export async function updateTemplateStatus(
  userId: number,
  templateKey: string,
  status: string,
  metaStatus?: string,
  rejectionReason?: string
) {
  await pool.query(
    `UPDATE whatsapp_templates SET status = $3, meta_status = $4, rejection_reason = $5,
     last_synced_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND template_key = $2`,
    [userId, templateKey, status, metaStatus || null, rejectionReason || null]
  );
}

export async function insertOutboundMessage(input: {
  userId: number;
  orderId?: string | null;
  templateKey?: string;
  recipientPhone: string;
  bodyPreview: string;
  payload?: Record<string, unknown>;
}) {
  const r = await pool.query(
    `INSERT INTO whatsapp_messages (
      user_id, order_id, direction, message_type, template_key, recipient_phone,
      status, body_preview, payload
    ) VALUES ($1, $2, 'outbound', 'template', $3, $4, 'queued', $5, $6::jsonb)
    RETURNING *`,
    [
      input.userId,
      input.orderId || null,
      input.templateKey || null,
      input.recipientPhone,
      input.bodyPreview,
      JSON.stringify(input.payload || {}),
    ]
  );
  return r.rows[0];
}

export async function updateMessageStatus(
  waMessageId: string,
  status: string,
  extra?: { errorMessage?: string }
) {
  const sets = ['status = $2', 'updated_at = NOW()'];
  const params: unknown[] = [waMessageId, status];
  if (status === 'sent') sets.push(`sent_at = COALESCE(sent_at, NOW())`);
  if (status === 'delivered') sets.push(`delivered_at = COALESCE(delivered_at, NOW())`);
  if (status === 'read') sets.push(`read_at = COALESCE(read_at, NOW())`);
  if (status === 'failed') {
    sets.push(`failed_at = NOW()`);
    if (extra?.errorMessage) {
      params.push(extra.errorMessage);
      sets.push(`error_message = $${params.length}`);
    }
  }
  await pool.query(
    `UPDATE whatsapp_messages SET ${sets.join(', ')} WHERE wa_message_id = $1`,
    params
  );
}

export async function insertInboundMessage(input: {
  userId: number;
  orderId?: string | null;
  senderPhone: string;
  waMessageId: string;
  bodyPreview: string;
  payload?: Record<string, unknown>;
}) {
  const r = await pool.query(
    `INSERT INTO whatsapp_messages (
      user_id, order_id, direction, message_type, sender_phone, wa_message_id,
      status, body_preview, payload, read_at
    ) VALUES ($1, $2, 'inbound', 'text', $3, $4, 'received', $5, $6::jsonb, NOW())
    RETURNING *`,
    [
      input.userId,
      input.orderId || null,
      input.senderPhone,
      input.waMessageId,
      input.bodyPreview,
      JSON.stringify(input.payload || {}),
    ]
  );
  return r.rows[0];
}

export async function recordWebhookEvent(input: {
  eventId: string;
  userId?: number | null;
  phoneNumberId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO whatsapp_webhook_events (event_id, user_id, phone_number_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.eventId,
        input.userId || null,
        input.phoneNumberId || null,
        input.eventType,
        JSON.stringify(input.payload || {}),
      ]
    );
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('duplicate') || msg.includes('unique')) return false;
    throw err;
  }
}

export async function getWhatsAppStats(userId: number) {
  const r = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('delivered', 'read')) AS delivered,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'read') AS read_count,
      COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE direction = 'inbound' AND body_preview ILIKE '%تأكيد%') AS confirmed_signals
    FROM whatsapp_messages
    WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [userId]
  );
  const row = r.rows[0] || {};
  return {
    sent: Number(row.sent || 0),
    delivered: Number(row.delivered || 0),
    read: Number(row.read_count || 0),
    confirmed: Number(row.confirmed_signals || 0),
    failed: Number(row.failed || 0),
  };
}

export async function getWhatsAppAnalytics(userId: number) {
  const [today, period, topTemplates] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('delivered', 'read')) AS delivered,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'read') AS read_count,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound
       FROM whatsapp_messages
       WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
      [userId]
    ),
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('delivered', 'read')) AS delivered,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'read') AS read_count,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound
       FROM whatsapp_messages
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [userId]
    ),
    pool.query(
      `SELECT template_key, COUNT(*) AS cnt
       FROM whatsapp_messages
       WHERE user_id = $1 AND direction = 'outbound' AND template_key IS NOT NULL
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY template_key ORDER BY cnt DESC LIMIT 5`,
      [userId]
    ),
  ]);

  const t = today.rows[0] || {};
  const p = period.rows[0] || {};
  const sent30 = Number(p.sent || 0);
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    today: {
      sent: Number(t.sent || 0),
      delivered: Number(t.delivered || 0),
      read: Number(t.read_count || 0),
      failed: Number(t.failed || 0),
      inbound: Number(t.inbound || 0),
    },
    period30d: {
      sent: sent30,
      delivered: Number(p.delivered || 0),
      read: Number(p.read_count || 0),
      failed: Number(p.failed || 0),
      inbound: Number(p.inbound || 0),
      deliveryPct: pct(Number(p.delivered || 0), sent30),
      readPct: pct(Number(p.read_count || 0), sent30),
      failedPct: pct(Number(p.failed || 0), sent30),
      confirmationPct: pct(Number(p.inbound || 0), sent30),
    },
    topTemplates: topTemplates.rows.map((r) => ({
      key: r.template_key,
      count: Number(r.cnt),
    })),
  };
}

export async function getRecentActivity(userId: number, limit = 25) {
  const r = await pool.query(
    `SELECT m.id, m.direction, m.message_type, m.template_key, m.status, m.body_preview,
            m.recipient_phone, m.sender_phone, m.sent_at, m.delivered_at, m.read_at, m.failed_at,
            m.created_at, m.order_id, o.external_id AS order_external_id
     FROM whatsapp_messages m
     LEFT JOIN integration_orders o ON o.id = m.order_id
     WHERE m.user_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    messageType: row.message_type,
    templateKey: row.template_key,
    status: row.status,
    bodyPreview: row.body_preview,
    phone: row.direction === 'outbound' ? maskPhone(row.recipient_phone) : maskPhone(row.sender_phone),
    orderId: row.order_id,
    orderExternalId: row.order_external_id,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
  }));
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return '****';
  return `…${d.slice(-4)}`;
}

export async function listFailedOutboundMessages(userId: number, limit = 50) {
  const r = await pool.query(
    `SELECT id, order_id, recipient_phone, template_key, body_preview, error_message, created_at
     FROM whatsapp_messages
     WHERE user_id = $1 AND direction = 'outbound' AND status = 'failed'
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

export async function getOrderWhatsAppMessages(userId: number, orderId: string) {
  const r = await pool.query(
    `SELECT id, direction, message_type, template_key, status, body_preview,
            sent_at, delivered_at, read_at, failed_at, created_at
     FROM whatsapp_messages
     WHERE user_id = $1 AND order_id = $2
     ORDER BY created_at ASC`,
    [userId, orderId]
  );
  return r.rows;
}
