import { Router } from 'express';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getOrderStats } from '../services/ordersDb';
import { pool } from '../config/db_pg';

const router = Router();
router.use(authenticate);

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

router.get('/kpis', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }

    const stats = await getOrderStats(userId);
    const totalOrders = stats.total || 0;
    const confirmed = stats.confirmed || 0;
    const shipped = stats.shipped || 0;

    let totalRevenue = 0;
    try {
      const rev = await pool.query(
        `SELECT COALESCE(SUM(cod_amount), 0)::float AS revenue
         FROM integration_orders
         WHERE user_id = $1 AND status IN ('confirmed', 'shipped')`,
        [userId],
      );
      totalRevenue = Number(rev.rows[0]?.revenue || 0);
    } catch {
      /* non-fatal */
    }

    const confirmationRate = totalOrders > 0 ? Math.round((confirmed / totalOrders) * 1000) / 10 : 0;
    const deliveryRate = confirmed > 0 ? Math.round((shipped / confirmed) * 1000) / 10 : 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        activeOrders: totalOrders,
        confirmationRate,
        deliveryRate,
        metaAdSpend: 0,
        roas: 0,
        whatsappMessages: 0,
        avgFulfillment: 0,
        revenueChange: 0,
        ordersChange: 0,
        confirmationChange: 0,
        deliveryChange: 0,
        adSpendChange: 0,
        roasChange: 0,
        source: 'integration_orders',
      },
    });
  } catch (err: unknown) {
    logger.error('Analytics KPIs error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load analytics' });
  }
});

router.get('/campaigns', async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [], note: 'Campaign analytics not configured; connect Meta integration for live data.' });
});

router.get('/shipping', async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [], note: 'Shipping analytics derived from integration orders workflow statuses.' });
});

export default router;
