import { pool } from '../../config/db_pg';
import { logger } from '../../config/logger';

const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  starter: 50,
  basic: 50,
  pro: 200,
  enterprise: 10000,
};

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export class CostAnalyzerQuotaError extends Error {
  code = 'COST_ANALYZER_QUOTA_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'CostAnalyzerQuotaError';
  }
}

export async function getCostAnalyzerLimit(
  userId: number,
  plan: string,
  role: string
): Promise<number> {
  if (role === 'admin' || role === 'superadmin') return 100000;
  const r = await pool.query(
    'SELECT cost_analyzer_monthly_limit FROM users WHERE id = $1',
    [userId]
  );
  const override = r.rows[0]?.cost_analyzer_monthly_limit;
  if (override != null && Number(override) >= 0) return Number(override);
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export async function getCostAnalyzerUsage(userId: number, plan: string, role: string) {
  const ym = currentYearMonth();
  const limit = await getCostAnalyzerLimit(userId, plan, role);
  const r = await pool.query(
    `INSERT INTO monthly_ai_usage (user_id, year_month, usage_count)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id, year_month) DO UPDATE SET updated_at = NOW()
     RETURNING usage_count`,
    [userId, ym]
  );
  const used = Number(r.rows[0]?.usage_count ?? 0);
  return {
    yearMonth: ym,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    canAnalyze: used < limit,
  };
}

export async function assertCostAnalyzerQuota(userId: number, plan: string, role: string): Promise<void> {
  const usage = await getCostAnalyzerUsage(userId, plan, role);
  if (!usage.canAnalyze) {
    throw new CostAnalyzerQuotaError('You have reached your monthly AI analysis limit.');
  }
}

export async function incrementCostAnalyzerUsage(userId: number): Promise<void> {
  const ym = currentYearMonth();
  await pool.query(
    `INSERT INTO monthly_ai_usage (user_id, year_month, usage_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, year_month)
     DO UPDATE SET usage_count = monthly_ai_usage.usage_count + 1, updated_at = NOW()`,
    [userId, ym]
  );
  logger.info('Cost analyzer AI usage incremented', { userId, yearMonth: ym });
}
