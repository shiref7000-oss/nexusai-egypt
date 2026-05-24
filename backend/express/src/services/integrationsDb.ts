import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db_pg';
import { logger } from '../config/logger';
import { INTEGRATION_EVENT_TYPES } from '../types/integrations';

export { INTEGRATION_EVENT_TYPES };

export function generateSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const prefix = `nxk_${crypto.randomBytes(4).toString('hex')}`;
  const secret = crypto.randomBytes(24).toString('hex');
  const raw = `${prefix}_${secret}`;
  const hash = bcrypt.hashSync(raw, 12);
  return { raw, prefix, hash };
}

export function hashApiKey(raw: string): string {
  return bcrypt.hashSync(raw, 12);
}

export async function createIntegration(
  userId: number,
  data: { name: string; description?: string; organizationId?: number }
) {
  const incomingSecret = generateSecret();
  const r = await pool.query(
    `INSERT INTO integrations (user_id, organization_id, name, description, incoming_secret)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, data.organizationId || null, data.name, data.description || null, incomingSecret]
  );
  return r.rows[0];
}

export async function regenerateIncomingSecret(userId: number, integrationId: number) {
  const secret = generateSecret();
  const r = await pool.query(
    `UPDATE integrations SET incoming_secret = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 RETURNING *`,
    [secret, integrationId, userId]
  );
  return r.rows[0] || null;
}

export async function listIntegrations(userId: number) {
  const r = await pool.query(
    `SELECT i.*,
      (SELECT COUNT(*)::int FROM webhooks w WHERE w.integration_id = i.id) AS webhook_count,
      (SELECT COUNT(*)::int FROM integration_api_keys k WHERE k.integration_id = i.id AND k.enabled = true) AS api_key_count
     FROM integrations i WHERE i.user_id = $1 ORDER BY i.created_at DESC`,
    [userId]
  );
  return r.rows;
}

export async function getIntegration(userId: number, integrationId: number) {
  const r = await pool.query(
    'SELECT * FROM integrations WHERE id = $1 AND user_id = $2',
    [integrationId, userId]
  );
  return r.rows[0] || null;
}

export async function updateIntegration(
  userId: number,
  integrationId: number,
  patch: { name?: string; description?: string; enabled?: boolean }
) {
  const fields: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) { fields.push(`name = $${i++}`); vals.push(patch.name); }
  if (patch.description !== undefined) { fields.push(`description = $${i++}`); vals.push(patch.description); }
  if (patch.enabled !== undefined) { fields.push(`enabled = $${i++}`); vals.push(patch.enabled); }
  if (!fields.length) return getIntegration(userId, integrationId);
  fields.push(`updated_at = NOW()`);
  vals.push(integrationId, userId);
  const r = await pool.query(
    `UPDATE integrations SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

export async function getIntegrationOrderCount(userId: number, integrationId: number) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM integration_orders
     WHERE user_id = $1 AND integration_id = $2`,
    [userId, integrationId]
  );
  return r.rows[0].count as number;
}

export async function deleteIntegration(userId: number, integrationId: number) {
  const r = await pool.query(
    'DELETE FROM integrations WHERE id = $1 AND user_id = $2 RETURNING id',
    [integrationId, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function createWebhook(
  userId: number,
  integrationId: number,
  data: { name: string; url: string; eventTypes: string[] }
) {
  const secret = generateSecret();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wh = await client.query(
      `INSERT INTO webhooks (integration_id, user_id, name, url, secret)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [integrationId, userId, data.name, data.url, secret]
    );
    const webhook = wh.rows[0];
    for (const eventType of data.eventTypes) {
      await client.query(
        `INSERT INTO event_subscriptions (webhook_id, event_type) VALUES ($1, $2)
         ON CONFLICT (webhook_id, event_type) DO UPDATE SET enabled = true`,
        [webhook.id, eventType]
      );
    }
    await client.query('COMMIT');
    return { ...webhook, secret };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listWebhooks(userId: number, integrationId: number) {
  const r = await pool.query(
    `SELECT w.id, w.integration_id, w.name, w.url, w.enabled, w.created_at, w.updated_at,
      COALESCE(json_agg(json_build_object('event_type', es.event_type, 'enabled', es.enabled))
        FILTER (WHERE es.id IS NOT NULL), '[]') AS subscriptions
     FROM webhooks w
     LEFT JOIN event_subscriptions es ON es.webhook_id = w.id
     WHERE w.user_id = $1 AND w.integration_id = $2
     GROUP BY w.id ORDER BY w.created_at DESC`,
    [userId, integrationId]
  );
  return r.rows.map((row) => ({ ...row, secret: undefined }));
}

export async function getWebhookById(webhookId: string, userId?: number) {
  const params: unknown[] = [webhookId];
  let sql = `SELECT w.*, i.enabled AS integration_enabled
    FROM webhooks w JOIN integrations i ON i.id = w.integration_id WHERE w.id = $1`;
  if (userId != null) {
    sql += ' AND w.user_id = $2';
    params.push(userId);
  }
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

export async function updateWebhook(
  userId: number,
  webhookId: string,
  patch: { name?: string; url?: string; enabled?: boolean; eventTypes?: string[] }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fields: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) { fields.push(`name = $${i++}`); vals.push(patch.name); }
    if (patch.url !== undefined) { fields.push(`url = $${i++}`); vals.push(patch.url); }
    if (patch.enabled !== undefined) { fields.push(`enabled = $${i++}`); vals.push(patch.enabled); }
    if (fields.length) {
      fields.push('updated_at = NOW()');
      vals.push(webhookId, userId);
      await client.query(
        `UPDATE webhooks SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
        vals
      );
    }
    if (patch.eventTypes) {
      await client.query(
        'UPDATE event_subscriptions SET enabled = false WHERE webhook_id = $1',
        [webhookId]
      );
      for (const eventType of patch.eventTypes) {
        await client.query(
          `INSERT INTO event_subscriptions (webhook_id, event_type) VALUES ($1, $2)
           ON CONFLICT (webhook_id, event_type) DO UPDATE SET enabled = true`,
          [webhookId, eventType]
        );
      }
    }
    await client.query('COMMIT');
    return getWebhookById(webhookId, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createApiKey(
  userId: number,
  integrationId: number,
  name: string,
  permissions?: string[]
) {
  const { raw, prefix, hash } = generateApiKey();
  const r = await pool.query(
    `INSERT INTO integration_api_keys (integration_id, user_id, name, key_prefix, key_hash, permissions)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, integration_id, name, key_prefix, permissions, enabled, created_at`,
    [
      integrationId,
      userId,
      name,
      prefix,
      hash,
      JSON.stringify(
        permissions || ['orders:write', 'orders:read', 'events:emit']
      ),
    ]
  );
  return { ...r.rows[0], key: raw };
}

export async function listApiKeys(userId: number, integrationId: number) {
  const r = await pool.query(
    `SELECT id, integration_id, name, key_prefix, permissions, enabled, last_used_at, expires_at, created_at
     FROM integration_api_keys WHERE user_id = $1 AND integration_id = $2 ORDER BY created_at DESC`,
    [userId, integrationId]
  );
  return r.rows;
}

export async function findApiKeyByRaw(rawKey: string) {
  const parts = rawKey.split('_');
  const prefix = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : rawKey.slice(0, 12);
  const r = await pool.query(
    `SELECT k.*, i.enabled AS integration_enabled, i.user_id, i.id AS integration_id
     FROM integration_api_keys k
     JOIN integrations i ON i.id = k.integration_id
     WHERE k.key_prefix = $1 AND k.enabled = true AND i.enabled = true`,
    [prefix]
  );
  for (const row of r.rows) {
    if (bcrypt.compareSync(rawKey, row.key_hash)) {
      return row;
    }
  }
  return null;
}

export async function touchApiKey(id: string) {
  await pool.query('UPDATE integration_api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
}

export async function insertWebhookEvent(data: {
  userId: number;
  integrationId?: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  source?: string;
  idempotencyKey?: string;
}) {
  try {
    const r = await pool.query(
      `INSERT INTO webhook_events (user_id, integration_id, event_type, payload, source, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.userId,
        data.integrationId ?? null,
        data.eventType,
        JSON.stringify(data.payload),
        data.source || 'system',
        data.idempotencyKey || null,
      ]
    );
    return r.rows[0];
  } catch (err: any) {
    if (err.code === '23505' && data.idempotencyKey) {
      const existing = await pool.query(
        'SELECT * FROM webhook_events WHERE user_id = $1 AND idempotency_key = $2',
        [data.userId, data.idempotencyKey]
      );
      return existing.rows[0];
    }
    throw err;
  }
}

export async function findSubscribedWebhooks(userId: number, eventType: string) {
  const r = await pool.query(
    `SELECT w.* FROM webhooks w
     JOIN integrations i ON i.id = w.integration_id
     JOIN event_subscriptions es ON es.webhook_id = w.id
     WHERE w.user_id = $1 AND w.enabled = true AND i.enabled = true
       AND es.event_type = $2 AND es.enabled = true`,
    [userId, eventType]
  );
  return r.rows;
}

export async function createWebhookLog(webhookId: string, eventId: string, userId: number) {
  const r = await pool.query(
    `INSERT INTO webhook_logs (webhook_id, event_id, user_id, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [webhookId, eventId, userId]
  );
  return r.rows[0];
}

export async function updateWebhookLog(
  logId: string,
  patch: {
    status: string;
    attemptCount?: number;
    httpStatus?: number;
    responseBody?: string;
    errorMessage?: string;
    durationMs?: number;
    nextRetryAt?: Date | null;
    deliveredAt?: Date | null;
  }
) {
  const r = await pool.query(
    `UPDATE webhook_logs SET
      status = $2,
      attempt_count = COALESCE($3, attempt_count),
      http_status = $4,
      response_body = $5,
      error_message = $6,
      duration_ms = $7,
      next_retry_at = $8,
      delivered_at = $9,
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      logId,
      patch.status,
      patch.attemptCount ?? null,
      patch.httpStatus ?? null,
      patch.responseBody?.slice(0, 4000) ?? null,
      patch.errorMessage?.slice(0, 2000) ?? null,
      patch.durationMs ?? null,
      patch.nextRetryAt ?? null,
      patch.deliveredAt ?? null,
    ]
  );
  return r.rows[0];
}

export async function getWebhookLog(logId: string, userId: number) {
  const r = await pool.query(
    'SELECT * FROM webhook_logs WHERE id = $1 AND user_id = $2',
    [logId, userId]
  );
  return r.rows[0] || null;
}

export async function listWebhookLogs(
  userId: number,
  opts: { webhookId?: string; status?: string; limit?: number; offset?: number }
) {
  const limit = Math.min(opts.limit || 50, 100);
  const offset = opts.offset || 0;
  const params: unknown[] = [userId];
  let where = 'WHERE wl.user_id = $1';
  if (opts.webhookId) {
    params.push(opts.webhookId);
    where += ` AND wl.webhook_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND wl.status = $${params.length}`;
  }
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT wl.*, we.event_type, we.payload AS event_payload, w.name AS webhook_name, w.url AS webhook_url
     FROM webhook_logs wl
     JOIN webhook_events we ON we.id = wl.event_id
     JOIN webhooks w ON w.id = wl.webhook_id
     ${where}
     ORDER BY wl.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows;
}

export async function getIntegrationStats(userId: number) {
  const [integrations, webhooks, events, logs] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS c FROM integrations WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*)::int AS c FROM webhooks WHERE user_id = $1', [userId]),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM webhook_events WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
      [userId]
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS c FROM webhook_logs WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '24 hours' GROUP BY status`,
      [userId]
    ),
  ]);
  const byStatus: Record<string, number> = {};
  for (const row of logs.rows) byStatus[row.status] = row.c;
  return {
    integrations: integrations.rows[0].c,
    webhooks: webhooks.rows[0].c,
    events24h: events.rows[0].c,
    deliveries24h: byStatus,
    failed24h: (byStatus.failed || 0) + (byStatus.dead_letter || 0),
    pending: byStatus.pending || 0,
    delivered24h: byStatus.delivered || 0,
  };
}

export async function getEventById(eventId: string, userId: number) {
  const r = await pool.query(
    'SELECT * FROM webhook_events WHERE id = $1 AND user_id = $2',
    [eventId, userId]
  );
  return r.rows[0] || null;
}

export async function getLogsForEvent(eventId: string) {
  return pool.query('SELECT * FROM webhook_logs WHERE event_id = $1', [eventId]);
}
