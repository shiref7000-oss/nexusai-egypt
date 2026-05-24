import { pool } from '../../config/db_pg';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getAISettings } from '../aiSettings';

export type PlatformCostStatus = {
  totalUsd: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  warning: boolean;
  blocked: boolean;
  month: string;
};

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Sum estimated AI spend for the current calendar month (all users). */
export async function getPlatformMonthlyCostUsd(): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT COALESCE(SUM(cost_usd::numeric), 0)::float AS total
       FROM usage_logs
       WHERE created_at >= date_trunc('month', NOW()::timestamp)`,
    );
    return Number(r.rows[0]?.total) || 0;
  } catch (err: unknown) {
    logger.warn('Platform cost query failed', {
      error: err instanceof Error ? err.message : err,
    });
    return 0;
  }
}

export async function checkPlatformCostBudget(): Promise<PlatformCostStatus> {
  const totalUsd = await getPlatformMonthlyCostUsd();
  const settings = await getAISettings();
  const softLimitUsd = settings.softLimitUsd ?? env.AI_PLATFORM_COST_SOFT_USD;
  const hardLimitUsd = settings.hardLimitUsd ?? env.AI_PLATFORM_COST_HARD_USD;
  const warning = totalUsd >= softLimitUsd && totalUsd < hardLimitUsd;
  const blocked = totalUsd >= hardLimitUsd;

  if (warning) {
    logger.warn('Platform AI cost soft limit reached', {
      totalUsd,
      softLimitUsd,
      hardLimitUsd,
    });
  }
  if (blocked) {
    logger.error('Platform AI cost hard limit reached — blocking new inference', {
      totalUsd,
      hardLimitUsd,
    });
  }

  return {
    totalUsd,
    softLimitUsd,
    hardLimitUsd,
    warning,
    blocked,
    month: currentYearMonth(),
  };
}

export class PlatformBudgetExceededError extends Error {
  code = 'PLATFORM_AI_BUDGET_EXCEEDED';
  status: PlatformCostStatus;

  constructor(status: PlatformCostStatus) {
    super(
      `Platform AI budget exceeded ($${status.totalUsd.toFixed(2)} / $${status.hardLimitUsd} monthly cap).`
    );
    this.name = 'PlatformBudgetExceededError';
    this.status = status;
  }
}

export async function assertPlatformAIBudget(): Promise<PlatformCostStatus> {
  const status = await checkPlatformCostBudget();
  if (status.blocked) {
    throw new PlatformBudgetExceededError(status);
  }
  return status;
}
