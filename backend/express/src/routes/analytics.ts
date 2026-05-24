import { Router } from 'express';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getOrderStats } from '../services/ordersDb';
import { pool } from '../config/db_pg';
import { getMetaDashboard } from '../services/metaAds/sync';
import { getConnectionByUserId } from '../services/metaAds/db';
import {
  resolveWorkspaceUserId,
  sendWorkspaceDebug,
  wantsWorkspaceDebug,
} from '../utils/workspaceContext';

const router = Router();
router.use(authenticate);

router.get('/kpis', async (req: AuthenticatedRequest, res) => {
  try {
    const resolved = await resolveWorkspaceUserId(req);
    if (wantsWorkspaceDebug(req)) sendWorkspaceDebug(res, resolved.context);
    const userId = resolved.userId;
    if (!userId) {
      return res.status(resolved.status || 400).json({
        success: false,
        error: resolved.error || 'User not linked to database account',
        ...(wantsWorkspaceDebug(req) ? { debug: resolved.context } : {}),
      });
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

    let metaAdSpend = 0;
    let roas = 0;
    const metaConn = await getConnectionByUserId(userId);
    if (metaConn) {
      const metaDash = await getMetaDashboard(userId, {
        preset: 'last_30d',
        days: 30,
        since: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
        until: new Date().toISOString().slice(0, 10),
      });
      if (metaDash.connected && metaDash.summary) {
        metaAdSpend = Number(metaDash.summary.spend || 0);
        roas = Number(metaDash.summary.roas || 0);
      }
    }

    res.json({
      success: true,
      data: {
        totalRevenue,
        activeOrders: totalOrders,
        confirmationRate,
        deliveryRate,
        metaAdSpend,
        roas,
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
  try {
    const resolved = await resolveWorkspaceUserId(req);
    if (wantsWorkspaceDebug(req)) sendWorkspaceDebug(res, resolved.context);
    const userId = resolved.userId;
    if (!userId) {
      return res.status(resolved.status || 400).json({
        success: false,
        error: resolved.error || 'User not linked to database account',
        ...(wantsWorkspaceDebug(req) ? { debug: resolved.context } : {}),
      });
    }
    const dash = await getMetaDashboard(userId, {
      preset: 'last_30d',
      days: 30,
      since: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      until: new Date().toISOString().slice(0, 10),
    });
    if (!dash.connected) {
      return res.json({
        success: true,
        data: [],
        note: 'Connect Meta Ads at /meta-ads for live campaign data.',
      });
    }
    res.json({ success: true, data: dash.topCampaigns || [] });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load campaigns' });
  }
});

router.get('/shipping', async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [], note: 'Shipping analytics derived from integration orders workflow statuses.' });
});

export default router;
