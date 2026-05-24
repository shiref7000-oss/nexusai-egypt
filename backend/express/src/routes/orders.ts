import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import {
  listIntegrationOrders,
  getIntegrationOrderDetail,
  getOrderStats,
  updateIntegrationOrderStatus,
} from '../services/ordersDb';
import { paramStr } from '../utils/httpParam';

const router = Router();
router.use(authenticate);

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isString(),
  query('search').optional().trim(),
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }

    const result = await listIntegrationOrders(userId, {
      page: parseInt(String(req.query.page || '1'), 10),
      limit: parseInt(String(req.query.limit || '50'), 10),
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    });

    res.json({ success: true, data: result.orders, meta: result.meta });
  } catch (err: unknown) {
    logger.error('Orders list error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load orders' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database account' });
    const order = await getIntegrationOrderDetail(userId, paramStr(req.params.id));
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load order' });
  }
});

router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database account' });
    const status = req.body.status;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const existing = await getIntegrationOrderDetail(userId, paramStr(req.params.id));
    if (!existing) return res.status(404).json({ success: false, error: 'Order not found' });
    const updated = await updateIntegrationOrderStatus(
      userId,
      paramStr(req.params.id),
      Number(existing.integration_id),
      status,
      {
        notes: req.body.notes,
        changedBy: req.user?.email || 'api',
        source: 'orders_api',
      },
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: updated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

router.get('/stats/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database account' });
    const stats = await getOrderStats(userId);
    res.json({ success: true, data: stats });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load order stats' });
  }
});

export default router;
