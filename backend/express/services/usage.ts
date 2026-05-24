import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

export type PlanSlug = 'free' | 'starter' | 'pro' | 'enterprise' | 'basic';

const DEFAULT_LIMITS: Record<string, number> = {
  free: 100,
  starter: 1000,
  basic: 1000,
  pro: 10000,
  enterprise: 100000,
};

export interface UsageSnapshot {
  userId: number;
  email: string;
  plan: string;
  monthlyLimit: number;
  monthlyUsed: number;
  remaining: number;
  totalRequests: number;
  lastRequestAt: string | null;
  percentUsed: number;
}

export interface RecordUsageInput {
  userId: number;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  status: 'completed' | 'failed' | 'timeout';
  prompt?: string;
  response?: string;
  errorMessage?: string;
  agent?: string;
  costUsd?: number;
}

function planToPlansSlug(plan: string): string {
  if (plan === 'starter') return 'starter';
  if (plan === 'basic') return 'basic';
  return plan;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function resolvePgUserId(email: string): Promise<number | null> {
  const r = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return r.rows[0]?.id ?? null;
}

export async function getPlanLimit(plan: string): Promise<number> {
  const slug = planToPlansSlug(plan);
  try {
    const r = await pool.query(
      'SELECT monthly_requests FROM plans WHERE slug = $1 OR slug = $2 LIMIT 1',
      [slug, slug === 'starter' ? 'basic' : slug]
    );
    if (r.rows[0]?.monthly_requests != null) {
      return Number(r.rows[0].monthly_requests);
    }
  } catch (err: any) {
    logger.warn('getPlanLimit fallback', { plan, error: err.message });
  }
  return DEFAULT_LIMITS[slug] ?? DEFAULT_LIMITS.free;
}

/** Reset monthly counter when calendar month changes (stored in usage_monthly). */
export async function ensureMonthlyPeriod(userId: number): Promise<void> {
  const ym = currentYearMonth();
  const existing = await pool.query(
    'SELECT id, requests_count FROM usage_monthly WHERE user_id = $1 AND year_month = $2',
    [userId, ym]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO usage_monthly (user_id, year_month, requests_count, tokens_used, ai_requests)
       VALUES ($1, $2, 0, 0, 0)
       ON CONFLICT (user_id, year_month) DO NOTHING`,
      [userId, ym]
    );
    await pool.query(
      'UPDATE users SET monthly_requests_used = 0, updated_at = NOW() WHERE id = $1',
      [userId]
    );
  }
}

export async function getUserUsage(userId: number): Promise<UsageSnapshot | null> {
  const r = await pool.query(
    `SELECT id, email, plan::text AS plan, monthly_request_limit, monthly_requests_used,
            total_requests, last_request_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!r.rows[0]) return null;

  const row = r.rows[0];
  const limit = Number(row.monthly_request_limit) || (await getPlanLimit(row.plan));
  const used = Number(row.monthly_requests_used) || 0;
  const remaining = Math.max(0, limit - used);

  return {
    userId: row.id,
    email: row.email,
    plan: row.plan,
    monthlyLimit: limit,
    monthlyUsed: used,
    remaining,
    totalRequests: Number(row.total_requests) || 0,
    lastRequestAt: row.last_request_at ? new Date(row.last_request_at).toISOString() : null,
    percentUsed: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
  };
}

export class UsageLimitError extends Error {
  code = 'USAGE_LIMIT_EXCEEDED';
  statusCode = 429;
  constructor(
    public snapshot: UsageSnapshot,
    message = 'Monthly AI request limit reached. Please upgrade your plan to continue.'
  ) {
    super(message);
    this.name = 'UsageLimitError';
  }
}

/** Check quota; throws UsageLimitError when exceeded. */
export async function assertWithinLimit(userId: number): Promise<UsageSnapshot> {
  await ensureMonthlyPeriod(userId);
  const snapshot = await getUserUsage(userId);
  if (!snapshot) {
    throw new Error('User not found for usage tracking');
  }
  if (snapshot.monthlyUsed >= snapshot.monthlyLimit) {
    logger.warn('Usage limit exceeded', {
      userId,
      used: snapshot.monthlyUsed,
      limit: snapshot.monthlyLimit,
      plan: snapshot.plan,
    });
    throw new UsageLimitError(snapshot);
  }
  return snapshot;
}

/**
 * Record AI usage atomically. Call after limit check for successful paths,
 * or with status failed for denied/blocked attempts (does not increment on failed pre-check).
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const {
    userId,
    model,
    provider,
    promptTokens = 0,
    completionTokens = 0,
    totalTokens,
    latencyMs,
    status,
    prompt = '',
    response = '',
    errorMessage,
    agent,
    costUsd,
  } = input;

  const tokens = totalTokens ?? promptTokens + completionTokens;
  const ym = currentYearMonth();
  const increment = status === 'completed' ? 1 : 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO ai_requests (
        user_id, provider, model, status, prompt, response,
        prompt_tokens, completion_tokens, total_tokens, latency_ms, error_message, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId,
        provider || 'groq',
        model || null,
        status,
        prompt.slice(0, 8000),
        response.slice(0, 10000),
        promptTokens,
        completionTokens,
        tokens,
        latencyMs ?? null,
        errorMessage || null,
        agent ? JSON.stringify({ agent }) : null,
      ]
    );

    if (increment > 0) {
      await client.query(
        `UPDATE users SET
          monthly_requests_used = monthly_requests_used + 1,
          total_requests = total_requests + 1,
          last_request_at = NOW(),
          updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      await client.query(
        `INSERT INTO usage_monthly (user_id, year_month, requests_count, tokens_used, ai_requests)
         VALUES ($1, $2, 1, $3, 1)
         ON CONFLICT (user_id, year_month)
         DO UPDATE SET
           requests_count = usage_monthly.requests_count + 1,
           tokens_used = usage_monthly.tokens_used + EXCLUDED.tokens_used,
           ai_requests = usage_monthly.ai_requests + 1`,
        [userId, ym, tokens]
      );

      await client.query(
        `INSERT INTO usage_logs (user_id, request_type, tokens_used, cost_usd, latency_ms, provider, metadata)
         VALUES ($1, 'ai_completion', $2, $3, $4, $5, $6)`,
        [
          userId,
          tokens,
          costUsd != null ? String(costUsd.toFixed(6)) : String((tokens * 0.0000015).toFixed(6)),
          latencyMs ?? null,
          provider || null,
          JSON.stringify({ model, agent, status }),
        ]
      );
    }

    await client.query('COMMIT');
    logger.info('Usage recorded', { userId, status, tokens, model, provider });
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('recordUsage failed', { userId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

export async function syncUserPlanLimit(userId: number, plan: string): Promise<void> {
  const limit = await getPlanLimit(plan);
  await pool.query(
    'UPDATE users SET monthly_request_limit = $1, plan = $2::plan_enum, updated_at = NOW() WHERE id = $3',
    [limit, plan === 'basic' ? 'starter' : plan, userId]
  );
}

export async function getAdminUsageStats() {
  const ym = currentYearMonth();
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);

  const [platform, topUsers, failed30d] = await Promise.all([
    pool.query(
      `SELECT
        COALESCE(SUM(requests_count), 0)::int AS monthly_requests,
        COALESCE(SUM(tokens_used), 0)::int AS monthly_tokens
       FROM usage_monthly WHERE year_month = $1`,
      [ym]
    ),
    pool.query(
      `SELECT u.id, u.email, u.plan::text AS plan,
              u.monthly_requests_used,
              u.monthly_request_limit,
              u.total_requests,
              u.last_request_at,
              COALESCE(um.requests_count, 0) AS month_requests
       FROM users u
       LEFT JOIN usage_monthly um ON um.user_id = u.id AND um.year_month = $1
       ORDER BY u.monthly_requests_used DESC, u.total_requests DESC
       LIMIT 10`,
      [ym]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM ai_requests
       WHERE status = 'failed' AND created_at >= $1`,
      [last30]
    ),
  ]);

  return {
    monthlyRequests: Number(platform.rows[0]?.monthly_requests || 0),
    monthlyTokens: Number(platform.rows[0]?.monthly_tokens || 0),
    topUsers: topUsers.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      plan: r.plan,
      monthlyUsed: Number(r.monthly_requests_used || 0),
      monthlyLimit: Number(r.monthly_request_limit || 100),
      remaining: Math.max(0, Number(r.monthly_request_limit || 0) - Number(r.monthly_requests_used || 0)),
      totalRequests: Number(r.total_requests || 0),
      lastRequestAt: r.last_request_at,
    })),
    failedRequests30d: Number(failed30d.rows[0]?.count || 0),
  };
}
