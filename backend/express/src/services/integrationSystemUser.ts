import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

let cachedSystemUserId: number | null = null;

/** Resolve tenant user for carrier webhooks (first active superadmin). */
export async function getSystemIntegrationUserId(): Promise<number | null> {
  if (cachedSystemUserId) return cachedSystemUserId;
  try {
    const r = await pool.query(
      `SELECT id FROM users WHERE role = 'superadmin' AND status = 'active' ORDER BY id LIMIT 1`
    );
    cachedSystemUserId = r.rows[0]?.id ?? null;
    return cachedSystemUserId;
  } catch (err: any) {
    logger.warn('System integration user lookup failed', { error: err.message });
    return null;
  }
}
