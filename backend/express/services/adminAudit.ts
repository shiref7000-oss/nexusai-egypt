import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../config/logger';

export function resolveAdminActorId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const id = req.user?.id;
  if (id && /^\d+$/.test(String(id))) return parseInt(String(id), 10);
  return null;
}

export async function logAdminAudit(
  req: AuthenticatedRequest,
  action: string,
  targetType: string,
  targetId: string,
  targetEmail: string | null,
  oldVals: Record<string, unknown>,
  newVals: Record<string, unknown>
): Promise<void> {
  const adminId = resolveAdminActorId(req);
  if (!adminId || !req.user?.email) {
    logger.warn('Audit skipped: admin has no PostgreSQL user id', { action, adminEmail: req.user?.email });
    return;
  }
  try {
    const { pool } = require('../config/db_pg');
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, target_email, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        adminId,
        req.user.email,
        action,
        targetType,
        targetId,
        targetEmail,
        JSON.stringify(oldVals),
        JSON.stringify(newVals),
        req.ip,
        req.headers['user-agent'],
      ]
    );
  } catch (e) {
    logger.error('Audit log failed', { error: (e as Error).message, action });
  }
}
