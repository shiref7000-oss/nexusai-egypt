import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { getAdminUsageStats } from '../services/usage';
import { logAdminAudit, resolveAdminActorId } from '../services/adminAudit';
import { displayPlan, updateAdminUser } from '../services/adminUserUpdate';

const router = Router();

const ROLE_LEVEL: Record<string, number> = {
  superadmin: 5,
  admin: 4,
  moderator: 3,
  manager: 3,
  user: 2,
  viewer: 1,
};

const VALID_ROLES = ['superadmin', 'admin', 'moderator', 'user', 'viewer'];
const VALID_STATUSES = ['active', 'inactive', 'suspended', 'pending'];
const VALID_PLANS = ['free', 'starter', 'basic', 'pro', 'enterprise'];

function getDb() {
  const { pool } = require('../config/db_pg');
  return pool;
}

function canModifyActor(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'superadmin') return true;
  return (ROLE_LEVEL[actorRole] || 0) > (ROLE_LEVEL[targetRole] || 0);
}

// ============================================================
// ADMIN DASHBOARD STATS
// ============================================================
router.get('/dashboard', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [usersResult, activeResult, plansResult, aiResult, revenueResult] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM users'),
      db.query("SELECT COUNT(*) as active FROM users WHERE status = 'active'"),
      db.query(`SELECT p.name, COUNT(us.user_id) as count FROM plans p LEFT JOIN user_subscriptions us ON p.slug = us.plan_slug AND us.status = 'active' GROUP BY p.id, p.name ORDER BY p.id`),
      db.query('SELECT COUNT(*) as total_requests, COALESCE(SUM(total_tokens), 0) as total_tokens FROM ai_requests WHERE created_at >= NOW() - INTERVAL \'30 days\''),
      db.query('SELECT COALESCE(SUM(price_usd_monthly), 0) as mrr FROM user_subscriptions us JOIN plans p ON us.plan_slug = p.slug WHERE us.status = \'active\''),
    ]);

    const usageResult = await db.query(
      'SELECT COALESCE(SUM(requests_count), 0) as monthly_requests FROM usage_monthly WHERE year_month = $1',
      [thisMonth]
    );

    const usageStats = await getAdminUsageStats();

    res.json({
      success: true,
      data: {
        users: {
          total: parseInt(usersResult.rows[0].total),
          active: parseInt(activeResult.rows[0].active),
          inactive: parseInt(usersResult.rows[0].total) - parseInt(activeResult.rows[0].active),
        },
        subscriptions: plansResult.rows.map((r: any) => ({ plan: r.name, count: parseInt(r.count) })),
        aiUsage: {
          totalRequests30d: parseInt(aiResult.rows[0].total_requests),
          totalTokens30d: parseInt(aiResult.rows[0].total_tokens),
          monthlyRequests: parseInt(usageResult.rows[0].monthly_requests),
          failedRequests30d: usageStats.failedRequests30d,
          platformMonthlyTokens: usageStats.monthlyTokens,
        },
        usage: {
          topUsers: usageStats.topUsers,
          failedRequests30d: usageStats.failedRequests30d,
          monthlyRequests: usageStats.monthlyRequests,
        },
        revenue: {
          mrr: parseFloat(revenueResult.rows[0].mrr),
          currency: 'USD',
        },
      },
    });
  } catch (err: any) {
    logger.error('Admin dashboard error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load dashboard stats' });
  }
});

// ============================================================
// USERS MANAGEMENT
// ============================================================
router.get('/users', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const roleFilter = req.query.role as string;
    const statusFilter = req.query.status as string;
    const planFilter = req.query.plan as string;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClause += ` AND (u.email ILIKE $${paramIdx} OR u.full_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (roleFilter) {
      whereClause += ` AND u.role = $${paramIdx}::role_enum`;
      params.push(roleFilter);
      paramIdx++;
    }
    if (statusFilter) {
      whereClause += ` AND u.status = $${paramIdx}::status_enum`;
      params.push(statusFilter);
      paramIdx++;
    }
    if (planFilter) {
      const dbPlan = planFilter === 'basic' ? 'starter' : planFilter;
      whereClause += ` AND u.plan = $${paramIdx}::plan_enum`;
      params.push(dbPlan);
      paramIdx++;
    }

    const countResult = await db.query(`SELECT COUNT(*) FROM users u ${whereClause}`, params);
    params.push(limit, offset);

    const result = await db.query(
      `SELECT u.id, u.supabase_uid, u.email, u.full_name, u.role, u.plan, u.status,
              u.monthly_request_limit, u.monthly_requests_used, u.total_requests,
              u.created_at, u.updated_at, u.last_login, u.login_count,
              p.slug as subscription_plan, p.name as subscription_name, us.status as subscription_status,
              (SELECT json_agg(json_build_object('feature', ff.feature, 'enabled', ff.enabled)) FROM feature_flags ff WHERE ff.user_id = u.id) as features
       FROM users u
       LEFT JOIN user_subscriptions us ON u.id = us.user_id
       LEFT JOIN plans p ON us.plan_slug = p.slug
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    const users = result.rows.map((row: any) => ({
      ...row,
      plan: displayPlan(row.plan),
      usage: {
        monthlyUsed: Number(row.monthly_requests_used) || 0,
        monthlyLimit: Number(row.monthly_request_limit) || 0,
        totalRequests: Number(row.total_requests) || 0,
      },
    }));

    res.json({
      success: true,
      data: {
        users,
        pagination: { page, limit, total: parseInt(countResult.rows[0].count) },
      },
    });
  } catch (err: any) {
    logger.error('Admin users error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load users' });
  }
});

// Get single user
router.get('/users/:id', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT u.id, u.supabase_uid, u.email, u.full_name, u.role, u.plan, u.status,
              u.monthly_request_limit, u.monthly_requests_used, u.created_at, u.updated_at, u.last_login, u.login_count,
              p.slug as subscription_plan, p.name as subscription_name, us.status as subscription_status
       FROM users u
       LEFT JOIN user_subscriptions us ON u.id = us.user_id
       LEFT JOIN plans p ON us.plan_slug = p.slug
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    // Get feature flags
    const ffResult = await db.query('SELECT feature, enabled, config FROM feature_flags WHERE user_id = $1', [req.params.id]);

    res.json({ success: true, data: { ...result.rows[0], featureFlags: ffResult.rows } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load user' });
  }
});

// Update user (role, status, plan)
router.put('/users/:id', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (Number.isNaN(userId)) return res.status(400).json({ success: false, error: 'Invalid user id' });

    const { role, status, plan } = req.body;
    const result = await updateAdminUser(req, userId, { role, status, plan });
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

    res.json({
      success: true,
      data: { message: 'User updated', user: result.user },
    });
  } catch (err: any) {
    logger.error('Update user error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

router.patch('/users/:id/plan', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (Number.isNaN(userId)) return res.status(400).json({ success: false, error: 'Invalid user id' });

    const { plan } = req.body;
    if (!plan) return res.status(400).json({ success: false, error: 'plan is required' });

    const result = await updateAdminUser(req, userId, { plan }, 'UPDATE_USER_PLAN');
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

    res.json({
      success: true,
      data: { message: 'Plan updated', user: result.user },
    });
  } catch (err: any) {
    logger.error('Update user plan error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update plan' });
  }
});

router.patch('/users/:id/status', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (Number.isNaN(userId)) return res.status(400).json({ success: false, error: 'Invalid user id' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });

    const result = await updateAdminUser(req, userId, { status }, 'UPDATE_USER_STATUS');
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

    res.json({
      success: true,
      data: { message: 'Status updated', user: result.user },
    });
  } catch (err: any) {
    logger.error('Update user status error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// Reset user password
router.put('/users/:id/reset-password', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

    const userResult = await db.query('SELECT email FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const hash = await bcryptjs.hash(newPassword, 12);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.params.id]
    );

    await logAdminAudit(req, 'RESET_PASSWORD', 'user', req.params.id, userResult.rows[0].email, {}, {});

    res.json({ success: true, data: { message: 'Password reset successfully' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// Delete user
router.delete('/users/:id', authenticate, requireRole('superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const userResult = await db.query('SELECT email, role FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    // Can't delete superadmins
    if (userResult.rows[0].role === 'superadmin') {
      return res.status(403).json({ success: false, error: 'Cannot delete superadmin users' });
    }

    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    await logAdminAudit(req, 'DELETE_USER', 'user', req.params.id, userResult.rows[0].email, {}, {});

    res.json({ success: true, data: { message: 'User deleted' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

// Impersonate user (login as user) — admin/superadmin only
router.post('/users/:id/impersonate', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) return res.status(400).json({ success: false, error: 'Invalid user id' });

    const result = await db.query(
      `SELECT id, email, full_name, role::text AS role, plan::text AS plan, status::text AS status
       FROM users WHERE id = $1`,
      [targetId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const user = result.rows[0];
    const actorRole = req.user?.role || 'user';
    if (!canModifyActor(actorRole, user.role)) {
      return res.status(403).json({ success: false, error: 'Cannot impersonate users with equal or higher role' });
    }

    const adminId = resolveAdminActorId(req);
    const token = jwt.sign(
      {
        userId: String(user.id),
        email: user.email,
        name: user.full_name || user.email,
        role: user.role,
        plan: displayPlan(user.plan),
        isImpersonation: true,
        impersonatedBy: req.user!.email,
        impersonatedById: adminId,
      },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    if (adminId) {
      await db.query(
        `INSERT INTO admin_impersonation_sessions (admin_id, admin_email, target_user_id, target_email, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, req.user!.email, user.id, user.email, req.ip, req.headers['user-agent']]
      );
    }

    await logAdminAudit(req, 'IMPERSONATE_START', 'user', String(targetId), user.email, {}, { targetRole: user.role, targetPlan: user.plan });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: String(user.id),
          email: user.email,
          name: user.full_name,
          role: user.role,
          plan: displayPlan(user.plan),
          status: user.status,
          impersonatedBy: req.user!.email,
        },
      },
    });
  } catch (err: any) {
    logger.error('Impersonate error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to impersonate' });
  }
});

// End impersonation (audit trail; client restores admin token from localStorage)
router.post('/impersonate/end', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.isImpersonation && req.user?.email) {
      await logAdminAudit(req, 'IMPERSONATE_END', 'user', req.user.id, req.user.email, {}, { impersonatedBy: req.user.impersonatedBy });
    }
    res.json({ success: true, data: { message: 'Impersonation ended' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to end impersonation' });
  }
});

// ============================================================
// PLANS
// ============================================================
router.get('/plans', authenticate, requireRole('admin', 'superadmin'), async (_req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query('SELECT * FROM plans WHERE is_active = TRUE ORDER BY id');
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load plans' });
  }
});

// ============================================================
// FEATURE FLAGS
// ============================================================
router.get('/feature-flags/:userId', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query('SELECT feature, enabled, config FROM feature_flags WHERE user_id = $1', [req.params.userId]);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load feature flags' });
  }
});

router.put('/feature-flags/:userId', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const { feature, enabled } = req.body;
    await db.query(
      `INSERT INTO feature_flags (user_id, feature, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, feature) DO UPDATE SET enabled = $3, updated_at = NOW()`,
      [req.params.userId, feature, enabled]
    );
    res.json({ success: true, data: { message: 'Feature flag updated' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update feature flag' });
  }
});

// ============================================================
// ADMIN AUDIT LOGS
// ============================================================
router.get('/audit-logs', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countResult = await db.query('SELECT COUNT(*) FROM admin_audit_logs');

    res.json({
      success: true,
      data: { logs: result.rows, pagination: { page, limit, total: parseInt(countResult.rows[0].count) } },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load audit logs' });
  }
});

// ============================================================
// SUBSCRIPTIONS
// ============================================================
router.get('/subscriptions', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT us.*, u.email, u.full_name, p.name as plan_name, p.price_usd_monthly
       FROM user_subscriptions us
       JOIN users u ON us.user_id = u.id
       JOIN plans p ON us.plan_slug = p.slug
       ORDER BY us.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load subscriptions' });
  }
});

router.put('/subscriptions/:id', authenticate, requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const { planSlug, status } = req.body;
    await db.query('UPDATE user_subscriptions SET plan_slug = $1, status = $2, updated_at = NOW() WHERE id = $3', [planSlug, status, req.params.id]);
    res.json({ success: true, data: { message: 'Subscription updated' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update subscription' });
  }
});

// ============================================================
// AI PROVIDER ANALYTICS
// ============================================================
router.get('/ai/providers', authenticate, requireRole('admin', 'superadmin'), async (_req: AuthenticatedRequest, res) => {
  try {
    const { getProviderHealth, getProviderAnalyticsSnapshot } = await import('../services/ai');
    const { getDbProviderAnalytics } = await import('../services/aiProviders/metrics');
    const days = parseInt((_req.query.days as string) || '7', 10);
    const [runtime, dbStats] = await Promise.all([
      Promise.resolve({
        health: getProviderHealth(),
        snapshot: getProviderAnalyticsSnapshot(),
      }),
      getDbProviderAnalytics(days).catch(() => null),
    ]);
    res.json({
      success: true,
      data: { runtime, database: dbStats },
    });
  } catch (err: any) {
    logger.error('Admin AI providers error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load AI provider analytics' });
  }
});

export default router;
