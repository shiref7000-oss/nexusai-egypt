import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getUserUsage, resolvePgUserId } from '../services/usage';
import { logger } from '../config/logger';

const router = Router();
router.use(authenticate);

router.get('/me', async (req: AuthenticatedRequest, res) => {
  try {
    const pgUserId = await resolvePgUserId(req.user!.email);
    if (!pgUserId) {
      return res.json({
        success: true,
        data: {
          monthlyLimit: 100,
          monthlyUsed: 0,
          remaining: 100,
          totalRequests: 0,
          lastRequestAt: null,
          percentUsed: 0,
          plan: req.user?.plan || 'free',
          source: 'default',
        },
      });
    }

    const usage = await getUserUsage(pgUserId);
    res.json({ success: true, data: usage });
  } catch (err: any) {
    logger.error('GET /usage/me error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load usage' });
  }
});

export default router;
