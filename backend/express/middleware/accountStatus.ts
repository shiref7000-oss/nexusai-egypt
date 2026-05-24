import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { pool } from '../config/db_pg';

const BLOCKED_STATUSES = new Set(['suspended', 'inactive', 'pending']);

/** Block AI/chat/API for non-active accounts (skipped during admin impersonation). */
export async function requireActiveAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if ((req as any).isImpersonation) return next();
  if (!req.user?.email) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  try {
    const r = await pool.query('SELECT status::text AS status FROM users WHERE email = $1 LIMIT 1', [req.user.email]);
    const status = r.rows[0]?.status;
    if (status && BLOCKED_STATUSES.has(status)) {
      const code = status === 'suspended' ? 'AUTH_SUSPENDED' : status === 'pending' ? 'AUTH_PENDING' : 'AUTH_INACTIVE';
      return res.status(403).json({
        success: false,
        error:
          status === 'pending'
            ? 'Account pending activation'
            : status === 'suspended'
              ? 'Account suspended'
              : 'Account inactive',
        code,
      });
    }
    next();
  } catch {
    next();
  }
}
