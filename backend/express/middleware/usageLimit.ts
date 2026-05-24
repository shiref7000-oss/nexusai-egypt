import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { assertWithinLimit, UsageLimitError, resolvePgUserId } from '../services/usage';
import { logger } from '../config/logger';

export async function requireUsageQuota(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const pgUserId = await resolvePgUserId(req.user.email);
    if (!pgUserId) {
      logger.warn('No PG user for usage check', { email: req.user.email });
      return next();
    }

    (req as any).pgUserId = pgUserId;
    const snapshot = await assertWithinLimit(pgUserId);
    (req as any).usageSnapshot = snapshot;
    next();
  } catch (err: any) {
    if (err instanceof UsageLimitError) {
      return res.status(429).json({
        success: false,
        error: err.message,
        code: err.code,
        data: {
          plan: err.snapshot.plan,
          monthlyLimit: err.snapshot.monthlyLimit,
          monthlyUsed: err.snapshot.monthlyUsed,
          remaining: 0,
          upgradeRequired: true,
        },
      });
    }
    logger.error('Usage middleware error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Unable to verify usage limits. Please try again.',
      code: 'USAGE_CHECK_FAILED',
    });
  }
}
