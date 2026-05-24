import { pool } from '../config/db_pg';
import { recordOrderStatusChange } from './orderStatusHistory';

export const ORDER_WORKFLOW_STATUSES = [
  'new',
  'pending_confirmation',
  'confirmed',
  'cancelled',
  'shipped',
] as const;

export type OrderWorkflowStatus = (typeof ORDER_WORKFLOW_STATUSES)[number];

/** @deprecated use ORDER_WORKFLOW_STATUSES */
export const V1_ORDER_STATUSES = ORDER_WORKFLOW_STATUSES;
export type V1OrderStatus = OrderWorkflowStatus;

export interface OrderProduct {
  sku?: string;
  name: string;
  quantity: number;
  price?: number;
}

export interface CreateIntegrationOrderInput {
  userId: number;
  integrationId: number;
  externalId: string;
  customerName: string;
  customerPhone: string;
  customerCity?: string | null;
  customerEmail?: string | null;
  products: OrderProduct[];
  codAmount: number;
  currency?: string;
  status?: OrderWorkflowStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  rawPayload?: Record<string, unknown> | null;
  recordHistory?: boolean;
  historySource?: string;
  changedBy?: string;
}

function rowToOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    external_id: row.external_id,
    integration_id: Number(row.integration_id),
    integration_name: row.integration_name as string | undefined,
    status: row.status,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      city: row.customer_city,
      email: row.customer_email,
    },
    products: row.products,
    cod_amount: Number(row.cod_amount),
    currency: row.currency,
    notes: row.notes,
    metadata: row.metadata,
    raw_payload: row.raw_payload,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createIntegrationOrder(input: CreateIntegrationOrderInput) {
  const status = input.status || 'new';
  const recordHistory = input.recordHistory !== false;
  try {
    const r = await pool.query(
      `INSERT INTO integration_orders (
        user_id, integration_id, external_id, status,
        customer_name, customer_phone, customer_city, customer_email,
        products, cod_amount, currency, notes, metadata, idempotency_key, raw_payload
      ) VALUES ($1, $2, $3, $4::public_order_status, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        input.userId,
        input.integrationId,
        input.externalId,
        status,
        input.customerName,
        input.customerPhone,
        input.customerCity || null,
        input.customerEmail || null,
        JSON.stringify(input.products || []),
        input.codAmount,
        input.currency || 'EGP',
        input.notes || null,
        JSON.stringify(input.metadata || {}),
        input.idempotencyKey || null,
        input.rawPayload ? JSON.stringify(input.rawPayload) : null,
      ]
    );
    const order = rowToOrder(r.rows[0]);
    if (recordHistory) {
      await recordOrderStatusChange({
        orderId: order.id as string,
        userId: input.userId,
        fromStatus: null,
        toStatus: status,
        changedBy: input.changedBy || 'webhook',
        source: input.historySource || 'webhook',
        notes: input.notes ?? null,
      });
    }
    return { order, created: true };
  } catch (err: any) {
    if (err.code === '23505') {
      if (input.idempotencyKey) {
        const existing = await pool.query(
          `SELECT * FROM integration_orders
           WHERE integration_id = $1 AND idempotency_key = $2`,
          [input.integrationId, input.idempotencyKey]
        );
        if (existing.rows[0]) {
          return { order: rowToOrder(existing.rows[0]), created: false };
        }
      }
      const dup = await pool.query(
        `SELECT * FROM integration_orders
         WHERE integration_id = $1 AND external_id = $2`,
        [input.integrationId, input.externalId]
      );
      if (dup.rows[0]) {
        return { order: rowToOrder(dup.rows[0]), created: false };
      }
    }
    throw err;
  }
}

export async function getIntegrationOrder(
  userId: number,
  orderId: string,
  integrationId?: number
) {
  const params: unknown[] = [orderId, userId];
  let sql = 'SELECT * FROM integration_orders WHERE id = $1 AND user_id = $2';
  if (integrationId != null) {
    params.push(integrationId);
    sql += ` AND integration_id = $${params.length}`;
  }
  const r = await pool.query(sql, params);
  return r.rows[0] ? rowToOrder(r.rows[0]) : null;
}

export async function getIntegrationOrderDetail(userId: number, orderId: string) {
  const r = await pool.query(
    `SELECT o.*, i.name AS integration_name
     FROM integration_orders o
     JOIN integrations i ON i.id = o.integration_id
     WHERE o.id = $1 AND o.user_id = $2`,
    [orderId, userId]
  );
  if (!r.rows[0]) return null;
  return rowToOrder(r.rows[0]);
}

export async function updateIntegrationOrderStatus(
  userId: number,
  orderId: string,
  integrationId: number,
  status: OrderWorkflowStatus,
  opts?: {
    notes?: string | null;
    changedBy?: string;
    source?: string;
  }
) {
  const existing = await pool.query(
    `SELECT status FROM integration_orders
     WHERE id = $1 AND user_id = $2 AND integration_id = $3`,
    [orderId, userId, integrationId]
  );
  if (!existing.rows[0]) return null;

  const fromStatus = existing.rows[0].status as OrderWorkflowStatus;
  if (fromStatus === status) {
    const current = await pool.query(
      'SELECT * FROM integration_orders WHERE id = $1',
      [orderId]
    );
    return current.rows[0] ? rowToOrder(current.rows[0]) : null;
  }

  const r = await pool.query(
    `UPDATE integration_orders SET
      status = $4::public_order_status,
      notes = COALESCE($5, notes),
      updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND integration_id = $3
     RETURNING *`,
    [orderId, userId, integrationId, status, opts?.notes ?? null]
  );
  if (!r.rows[0]) return null;

  await recordOrderStatusChange({
    orderId,
    userId,
    fromStatus,
    toStatus: status,
    changedBy: opts?.changedBy || String(userId),
    source: opts?.source || 'dashboard',
    notes: opts?.notes ?? null,
  });

  return rowToOrder(r.rows[0]);
}

export async function listIntegrationOrders(
  userId: number,
  opts: {
    integrationId?: number;
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  }
) {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 100);
  const offset = (page - 1) * limit;
  const params: unknown[] = [userId];
  let where = 'WHERE o.user_id = $1';
  if (opts.integrationId) {
    params.push(opts.integrationId);
    where += ` AND o.integration_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND o.status = $${params.length}::public_order_status`;
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where += ` AND (o.external_id ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR o.customer_phone ILIKE $${params.length})`;
  }

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM integration_orders o ${where}`,
    params
  );
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT o.*, i.name AS integration_name
     FROM integration_orders o
     JOIN integrations i ON i.id = o.integration_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    orders: r.rows.map(rowToOrder),
    meta: {
      page,
      limit,
      total: countR.rows[0].total,
      totalPages: Math.ceil(countR.rows[0].total / limit),
    },
  };
}

export async function getOrderStats(userId: number, integrationId?: number) {
  const params: unknown[] = [userId];
  let where = 'WHERE user_id = $1';
  if (integrationId) {
    params.push(integrationId);
    where += ` AND integration_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM integration_orders ${where}
     GROUP BY status`,
    params
  );
  const stats: Record<string, number> = {
    new: 0,
    pending_confirmation: 0,
    confirmed: 0,
    cancelled: 0,
    shipped: 0,
    total: 0,
  };
  for (const row of r.rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }
  return stats;
}

export async function getOrdersDashboard(userId: number) {
  const [todayR, confirmedR, failedR, activeR, latestR] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM integration_orders
       WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM integration_orders
       WHERE user_id = $1 AND status = 'confirmed'::public_order_status`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM incoming_webhook_logs
       WHERE user_id = $1 AND status = 'failed' AND created_at >= CURRENT_DATE`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM integrations
       WHERE user_id = $1 AND enabled = true`,
      [userId]
    ),
    pool.query(
      `SELECT o.*, i.name AS integration_name
       FROM integration_orders o
       JOIN integrations i ON i.id = o.integration_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT 8`,
      [userId]
    ),
  ]);

  return {
    incoming_today: todayR.rows[0].count,
    total_confirmed: confirmedR.rows[0].count,
    failed_webhooks_today: failedR.rows[0].count,
    active_integrations: activeR.rows[0].count,
    latest_orders: latestR.rows.map(rowToOrder),
    order_stats: await getOrderStats(userId),
  };
}
