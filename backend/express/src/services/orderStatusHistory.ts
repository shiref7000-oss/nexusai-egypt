import { pool } from '../config/db_pg';

export type OrderWorkflowStatus =
  | 'new'
  | 'pending_confirmation'
  | 'confirmed'
  | 'cancelled'
  | 'shipped';

export async function recordOrderStatusChange(data: {
  orderId: string;
  userId: number;
  fromStatus: OrderWorkflowStatus | null;
  toStatus: OrderWorkflowStatus;
  changedBy: string;
  source: string;
  notes?: string | null;
}) {
  const r = await pool.query(
    `INSERT INTO integration_order_status_history (
      order_id, user_id, from_status, to_status, changed_by, source, notes
    ) VALUES ($1, $2, $3::public_order_status, $4::public_order_status, $5, $6, $7)
    RETURNING *`,
    [
      data.orderId,
      data.userId,
      data.fromStatus,
      data.toStatus,
      data.changedBy,
      data.source,
      data.notes ?? null,
    ]
  );
  return r.rows[0];
}

export async function listOrderStatusHistory(userId: number, orderId: string) {
  const r = await pool.query(
    `SELECT h.*
     FROM integration_order_status_history h
     JOIN integration_orders o ON o.id = h.order_id
     WHERE h.order_id = $1 AND o.user_id = $2
     ORDER BY h.created_at ASC`,
    [orderId, userId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    from_status: row.from_status,
    to_status: row.to_status,
    changed_by: row.changed_by,
    source: row.source,
    notes: row.notes,
    created_at: row.created_at,
  }));
}
