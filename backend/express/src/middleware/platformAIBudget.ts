import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { checkPlatformCostBudget } from '../services/aiProviders/platformCost';
import { logger } from '../config/logger';

/** Blocks AI routes when monthly platform spend hits the hard cap; attaches budget status on request. */
export async function requirePlatformAIBudget(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const status = await checkPlatformCostBudget();
    (req as AuthenticatedRequest & { platformCostStatus?: typeof status }).platformCostStatus =
      status;

    if (status.blocked) {
      return res.status(503).json({
        success: false,
        error: 'AI services are temporarily paused — monthly platform budget reached.',
        code: 'PLATFORM_AI_BUDGET_EXCEEDED',
        data: status,
      });
    }

    if (status.warning) {
      res.setHeader('X-AI-Cost-Warning', 'true');
      logger.warn('AI request under cost soft-limit warning', {
        totalUsd: status.totalUsd,
        softLimitUsd: status.softLimitUsd,
      });
    }

    next();
  } catch (err: unknown) {
    logger.error('Platform budget check failed', {
      error: err instanceof Error ? err.message : err,
    });
    next();
  }
}
