import { pool } from '../config/db_pg';
import { storePayload } from './orderPayloadNormalizer';

export async function logIncomingWebhook(data: {
  userId: number;
  integrationId: number;
  status: 'success' | 'failed';
  httpStatus: number;
  payloadPreview: Record<string, unknown>;
  rawPayload?: Record<string, unknown> | null;
  orderId?: string | null;
  errorMessage?: string | null;
  validationErrors?: string[] | null;
  clientIp?: string | null;
}) {
  const raw = data.rawPayload ?? storePayload(data.payloadPreview);
  const r = await pool.query(
    `INSERT INTO incoming_webhook_logs (
      user_id, integration_id, status, http_status, error_message,
      validation_errors, payload_preview, raw_payload, order_id, client_ip
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      data.userId,
      data.integrationId,
      data.status,
      data.httpStatus,
      data.errorMessage || null,
      data.validationErrors ? JSON.stringify(data.validationErrors) : null,
      JSON.stringify(data.payloadPreview),
      raw ? JSON.stringify(raw) : null,
      data.orderId || null,
      data.clientIp || null,
    ]
  );
  return r.rows[0];
}

export async function listIncomingWebhookLogs(
  userId: number,
  opts: {
    integrationId?: number;
    orderId?: string;
    status?: 'success' | 'failed';
    limit?: number;
    offset?: number;
  }
) {
  const limit = Math.min(opts.limit || 50, 100);
  const offset = opts.offset || 0;
  const params: unknown[] = [userId];
  let where = 'WHERE l.user_id = $1';
  if (opts.integrationId) {
    params.push(opts.integrationId);
    where += ` AND l.integration_id = $${params.length}`;
  }
  if (opts.orderId) {
    params.push(opts.orderId);
    where += ` AND l.order_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND l.status = $${params.length}`;
  }
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT l.*, i.name AS integration_name
     FROM incoming_webhook_logs l
     JOIN integrations i ON i.id = l.integration_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows.map((row) => ({
    id: row.id,
    integration_id: row.integration_id,
    integration_name: row.integration_name,
    status: row.status,
    http_status: row.http_status,
    error_message: row.error_message,
    validation_errors: row.validation_errors,
    payload_preview: row.payload_preview,
    raw_payload: row.raw_payload,
    order_id: row.order_id,
    client_ip: row.client_ip,
    created_at: row.created_at,
  }));
}

export async function getIncomingLogStats(userId: number, hours = 24) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM incoming_webhook_logs
     WHERE user_id = $1 AND created_at >= NOW() - ($2::text || ' hours')::interval
     GROUP BY status`,
    [userId, String(hours)]
  );
  const stats = { success: 0, failed: 0, total: 0 };
  for (const row of r.rows) {
    stats[row.status as 'success' | 'failed'] = row.count;
    stats.total += row.count;
  }
  return stats;
}
