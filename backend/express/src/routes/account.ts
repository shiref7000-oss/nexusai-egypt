import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../config/db_pg';
import { findPgUserByEmail, verifyPgUserPassword, updatePgUserPassword } from '../services/userPersistence';
import { getUserUsage, getPlanLimit } from '../services/usage';
import { displayPlan } from '../services/adminUserUpdate';
import { logger } from '../config/logger';

const router = Router();
router.use(authenticate);

const DEFAULT_PREFERENCES = {
  notifications: {
    emailDigest: true,
    agentAlerts: true,
    billingAlerts: true,
    productUpdates: false,
  },
  language: 'en',
  timezone: 'Africa/Cairo',
  workspace: {
    defaultAgent: 'support',
    compactSidebar: false,
    arabicResponses: false,
  },
  paymentMethod: null as { brand: string; last4: string; exp: string } | null,
};

async function resolveUserId(req: AuthenticatedRequest): Promise<number | null> {
  if (req.user?.pgUserId) return req.user.pgUserId;
  if (req.user?.email) {
    const u = await findPgUserByEmail(req.user.email);
    return u?.id ?? null;
  }
  const id = req.user?.id;
  if (id && /^\d+$/.test(String(id))) return parseInt(String(id), 10);
  return null;
}

function mergePreferences(raw: unknown) {
  const base = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
  if (raw && typeof raw === 'object') {
    const p = raw as Record<string, unknown>;
    if (p.notifications && typeof p.notifications === 'object') {
      Object.assign(base.notifications, p.notifications);
    }
    if (typeof p.language === 'string') base.language = p.language;
    if (typeof p.timezone === 'string') base.timezone = p.timezone;
    if (p.workspace && typeof p.workspace === 'object') {
      Object.assign(base.workspace, p.workspace);
    }
    if (p.paymentMethod) base.paymentMethod = p.paymentMethod;
  }
  return base;
}

router.get('/settings', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database' });

    const userRes = await pool.query(
      `SELECT id, email, full_name, phone, avatar_url, preferences, plan::text AS plan, role::text AS role,
              monthly_request_limit, monthly_requests_used
       FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const row = userRes.rows[0];

    const keysRes = await pool.query(
      `SELECT id, name, key_prefix, last_used_at, created_at FROM user_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const integrationsRes = await pool.query(
      `SELECT id, name, enabled, created_at, updated_at FROM integrations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`,
      [userId]
    );

    const usage = await getUserUsage(userId);

    res.json({
      success: true,
      data: {
        profile: {
          name: row.full_name || req.user?.name || '',
          email: row.email,
          phone: row.phone || '',
          avatarUrl: row.avatar_url || '',
          plan: displayPlan(row.plan),
          role: row.role,
        },
        preferences: mergePreferences(row.preferences),
        apiKeys: keysRes.rows,
        connectedAccounts: integrationsRes.rows.map((i: { id: number; name: string; enabled: boolean; created_at: string }) => ({
          id: i.id,
          name: i.name,
          provider: 'integration',
          status: i.enabled ? 'connected' : 'disabled',
          connectedAt: i.created_at,
        })),
        usage: usage
          ? {
              monthlyLimit: usage.monthlyLimit,
              monthlyUsed: usage.monthlyUsed,
              remaining: usage.remaining,
              percentUsed: usage.percentUsed,
            }
          : null,
      },
    });
  } catch (err: unknown) {
    logger.error('Account settings load failed', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
});

router.patch(
  '/profile',
  [
    body('name').optional().trim().isLength({ min: 1, max: 120 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim().isLength({ max: 32 }),
    body('avatarUrl').optional().trim().isLength({ max: 2048 }),
  ],
  async (req: AuthenticatedRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const userId = await resolveUserId(req);
      if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database' });

      const { name, email, phone, avatarUrl } = req.body;
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (name !== undefined) {
        updates.push(`full_name = $${idx++}`);
        params.push(name);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${idx++}`);
        params.push(phone || null);
      }
      if (avatarUrl !== undefined) {
        updates.push(`avatar_url = $${idx++}`);
        params.push(avatarUrl || null);
      }
      if (email !== undefined) {
        const dup = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [
          email,
          userId,
        ]);
        if (dup.rows.length > 0) {
          return res.status(409).json({ success: false, error: 'Email already in use' });
        }
        updates.push(`email = $${idx++}`);
        params.push(email);
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');
      params.push(userId);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

      const refreshed = await pool.query(
        'SELECT email, full_name, phone, avatar_url FROM users WHERE id = $1',
        [userId]
      );
      const r = refreshed.rows[0];

      res.json({
        success: true,
        data: {
          profile: {
            name: r.full_name || '',
            email: r.email,
            phone: r.phone || '',
            avatarUrl: r.avatar_url || '',
          },
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  }
);

router.patch('/preferences', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database' });

    const current = await pool.query('SELECT preferences FROM users WHERE id = $1', [userId]);
    const merged = mergePreferences(current.rows[0]?.preferences);
    const patch = req.body || {};

    if (patch.notifications) Object.assign(merged.notifications, patch.notifications);
    if (patch.language) merged.language = patch.language;
    if (patch.timezone) merged.timezone = patch.timezone;
    if (patch.workspace) Object.assign(merged.workspace, patch.workspace);
    if (patch.paymentMethod !== undefined) merged.paymentMethod = patch.paymentMethod;

    await pool.query('UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(merged),
      userId,
    ]);

    res.json({ success: true, data: { preferences: merged } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

router.put(
  '/password',
  [body('currentPassword').exists(), body('newPassword').isLength({ min: 6 })],
  async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const userId = await resolveUserId(req);
    if (!userId || !req.user?.email) {
      return res.status(400).json({ success: false, error: 'User not found' });
    }

    const pgUser = await verifyPgUserPassword(req.user.email, req.body.currentPassword);
    if (!pgUser) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

    await updatePgUserPassword(userId, req.body.newPassword);
    res.json({ success: true, data: { message: 'Password updated' } });
  }
);

router.post(
  '/api-keys',
  [body('name').trim().isLength({ min: 2, max: 128 })],
  async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database' });

    const count = await pool.query('SELECT COUNT(*)::int AS c FROM user_api_keys WHERE user_id = $1', [userId]);
    if (Number(count.rows[0].c) >= 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 API keys per account' });
    }

    const rawKey = `nx_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const hash = await bcrypt.hash(rawKey, 10);

    const ins = await pool.query(
      `INSERT INTO user_api_keys (user_id, name, key_prefix, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, key_prefix, created_at`,
      [userId, req.body.name, prefix, hash]
    );

    res.status(201).json({
      success: true,
      data: {
        key: { ...ins.rows[0], secret: rawKey },
        message: 'Copy this key now. It will not be shown again.',
      },
    });
  }
);

router.delete('/api-keys/:id', async (req: AuthenticatedRequest, res) => {
  const userId = await resolveUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database' });

  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid key id' });

  const del = await pool.query('DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2 RETURNING id', [
    id,
    userId,
  ]);
  if (del.rowCount === 0) return res.status(404).json({ success: false, error: 'Key not found' });
  res.json({ success: true, data: { message: 'API key revoked' } });
});

router.get('/billing', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database' });

    const userRes = await pool.query(
      `SELECT u.id, u.email, u.plan::text AS plan, u.monthly_request_limit, u.monthly_requests_used,
              p.name AS plan_name, p.price_usd_monthly, p.monthly_requests AS plan_monthly_requests,
              us.status AS subscription_status
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
       LEFT JOIN plans p ON p.slug = COALESCE(us.plan_slug, u.plan::text)
       WHERE u.id = $1`,
      [userId]
    );
    const u = userRes.rows[0];
    const planSlug = displayPlan(u.plan);
    const limit = Number(u.monthly_request_limit) || (await getPlanLimit(u.plan));
    const used = Number(u.monthly_requests_used) || 0;

    let usageHistory;
    try {
      usageHistory = await pool.query(
        `SELECT year_month, requests_count, tokens_used
         FROM usage_monthly WHERE user_id = $1 ORDER BY year_month DESC LIMIT 6`,
        [userId]
      );
    } catch {
      usageHistory = await pool.query(
        `SELECT year_month, requests_count
         FROM usage_monthly WHERE user_id = $1 ORDER BY year_month DESC LIMIT 6`,
        [userId]
      );
    }

    let plansRes;
    try {
      plansRes = await pool.query(
        'SELECT slug, name, price_usd_monthly, monthly_requests, features FROM plans WHERE is_active = TRUE ORDER BY id'
      );
    } catch {
      plansRes = await pool.query(
        'SELECT slug, name, price_usd_monthly, monthly_requests FROM plans WHERE is_active = TRUE ORDER BY id'
      );
    }

    const price = Number(u.price_usd_monthly) || 0;
    const invoices = usageHistory.rows.map(
      (row: { year_month: string; requests_count: number; tokens_used: number }) => ({
        id: `inv-${row.year_month}`,
        period: row.year_month,
        amountUsd: price,
        status: 'paid',
        requests: Number(row.requests_count) || 0,
        tokens: Number(row.tokens_used) || 0,
      })
    );

    if (invoices.length === 0 && price >= 0) {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      invoices.push({
        id: `inv-${ym}`,
        period: ym,
        amountUsd: price,
        status: planSlug === 'free' ? 'no_charge' : 'paid',
        requests: used,
        tokens: 0,
      });
    }

    const prefsRes = await pool.query('SELECT preferences FROM users WHERE id = $1', [userId]);
    const prefs = mergePreferences(prefsRes.rows[0]?.preferences);

    res.json({
      success: true,
      data: {
        currentPlan: {
          slug: planSlug,
          name: u.plan_name || planSlug,
          priceUsdMonthly: price,
          status: u.subscription_status || 'active',
          periodEnd: null,
        },
        usage: {
          monthlyLimit: limit,
          monthlyUsed: used,
          percentUsed: limit > 0 ? Math.round((used / limit) * 100) : 0,
        },
        limits: {
          monthlyRequests: limit,
          agents: planSlug === 'free' ? 3 : planSlug === 'enterprise' ? 999 : 10,
          integrations: planSlug === 'free' ? 2 : planSlug === 'enterprise' ? 50 : 10,
          workflows: planSlug === 'free' ? 1 : planSlug === 'enterprise' ? 100 : 20,
        },
        paymentMethod: prefs.paymentMethod,
        invoices,
        plans: plansRes.rows.map((p: { slug: string; name: string; price_usd_monthly: number; monthly_requests: number; features: unknown }) => ({
          slug: displayPlan(p.slug),
          name: p.name,
          priceUsdMonthly: Number(p.price_usd_monthly),
          monthlyRequests: Number(p.monthly_requests),
          features: p.features,
        })),
      },
    });
  } catch (err: unknown) {
    logger.error('Billing load failed', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load billing' });
  }
});

export default router;
