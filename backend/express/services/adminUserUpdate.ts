import { AuthenticatedRequest } from '../middleware/auth';
import { logAdminAudit } from './adminAudit';
import { syncUserPlanLimit } from './usage';
import { normalizePlan } from './userPersistence';

const VALID_ROLES = ['superadmin', 'admin', 'moderator', 'user', 'viewer'];
const VALID_STATUSES = ['active', 'inactive', 'suspended', 'pending'];
const VALID_PLANS = ['free', 'starter', 'basic', 'pro', 'enterprise'];

const ROLE_LEVEL: Record<string, number> = {
  superadmin: 5,
  admin: 4,
  moderator: 3,
  manager: 3,
  user: 2,
  viewer: 1,
};

function getDb() {
  const { pool } = require('../config/db_pg');
  return pool;
}

export function displayPlan(plan: string): string {
  if (plan === 'starter') return 'basic';
  return plan;
}

function canModifyActor(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'superadmin') return true;
  return (ROLE_LEVEL[actorRole] || 0) > (ROLE_LEVEL[targetRole] || 0);
}

export type AdminUserPatch = { role?: string; status?: string; plan?: string };

export async function updateAdminUser(
  req: AuthenticatedRequest,
  userId: number,
  patch: AdminUserPatch,
  auditAction = 'UPDATE_USER'
) {
  const db = getDb();
  const { role, status, plan } = patch;

  const current = await db.query(
    'SELECT role::text AS role, status::text AS status, plan::text AS plan, email FROM users WHERE id = $1',
    [userId]
  );
  if (current.rows.length === 0) {
    return { ok: false as const, status: 404, error: 'User not found' };
  }

  const currentUserRole = req.user?.role || 'user';
  const targetUserRole = current.rows[0].role;
  if (!canModifyActor(currentUserRole, targetUserRole)) {
    return { ok: false as const, status: 403, error: 'Cannot modify users with equal or higher role' };
  }
  if (role && !VALID_ROLES.includes(role)) {
    return { ok: false as const, status: 400, error: 'Invalid role' };
  }
  if (role && !canModifyActor(currentUserRole, role)) {
    return { ok: false as const, status: 403, error: 'Cannot assign a role equal or higher than your own' };
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return { ok: false as const, status: 400, error: 'Invalid status' };
  }
  if (plan && !VALID_PLANS.includes(plan)) {
    return { ok: false as const, status: 400, error: 'Invalid plan' };
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (role) {
    updates.push(`role = $${idx++}::role_enum`);
    params.push(role);
  }
  if (status) {
    updates.push(`status = $${idx++}::status_enum`);
    params.push(status);
  }
  if (plan) {
    updates.push(`plan = $${idx++}::plan_enum`);
    params.push(normalizePlan(plan));
  }
  if (updates.length === 0) {
    return { ok: false as const, status: 400, error: 'No valid fields to update' };
  }

  updates.push('updated_at = NOW()');
  params.push(userId);
  await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  if (plan) {
    await syncUserPlanLimit(userId, normalizePlan(plan));
  }

  await logAdminAudit(
    req,
    auditAction,
    'user',
    String(userId),
    current.rows[0].email,
    {
      role: current.rows[0].role,
      status: current.rows[0].status,
      plan: displayPlan(current.rows[0].plan),
    },
    { role, status, plan: plan ? normalizePlan(plan) : undefined }
  );

  const refreshed = await db.query(
    `SELECT id, email, role::text AS role, status::text AS status, plan::text AS plan,
            monthly_request_limit, monthly_requests_used
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = refreshed.rows[0];
  return {
    ok: true as const,
    user: row
      ? {
          ...row,
          plan: displayPlan(row.plan),
          usage: {
            monthlyUsed: Number(row.monthly_requests_used) || 0,
            monthlyLimit: Number(row.monthly_request_limit) || 0,
          },
        }
      : undefined,
  };
}
