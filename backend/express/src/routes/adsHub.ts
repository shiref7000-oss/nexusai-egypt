import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { normalizePlatformScope } from '../services/adsPlatforms/registry';
import { generateAdsIntelligence } from '../services/adsIntelligence/aiInsights';
import {
  getAccountTrends,
  getAccountTotals,
  getCampaignPerformance,
  getTikTokVideoMetrics,
} from '../services/adsIntelligence/metricsRepository';
import { getDateWindowFromQuery } from '../services/adsIntelligence/dateWindow';
import { getOrSetCached } from '../services/adsIntelligence/requestCache';
import { getConnectionByUserId as getMetaConn } from '../services/metaAds/db';
import { getConnectionByUserId as getTikTokConn } from '../services/adsPlatforms/tiktok/db';
import { getMetaDashboard } from '../services/metaAds/sync';
import { getTikTokDashboard } from '../services/adsPlatforms/tiktok/sync';
import {
  resolveWorkspaceUserId,
  sendWorkspaceDebug,
  wantsWorkspaceDebug,
} from '../utils/workspaceContext';

const router = Router();
router.use(authenticate);

async function workspaceUserId(req: AuthenticatedRequest, res: import('express').Response) {
  const resolved = await resolveWorkspaceUserId(req);
  if (wantsWorkspaceDebug(req)) sendWorkspaceDebug(res, resolved.context);
  if (!resolved.userId) {
    res.status(resolved.status || 400).json({
      success: false,
      error: resolved.error || 'User not linked to database account',
      ...(wantsWorkspaceDebug(req) ? { debug: resolved.context } : {}),
    });
    return null;
  }
  return resolved.userId;
}

router.get('/status', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  const [meta, tiktok] = await Promise.all([getMetaConn(userId), getTikTokConn(userId)]);
  res.json({
    success: true,
    data: {
      meta: { connected: Boolean(meta && meta.status === 'connected') },
      tiktok: { connected: Boolean(tiktok && tiktok.status === 'connected') },
    },
  });
});

router.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const scope = normalizePlatformScope(String(req.query.platform || 'meta'));
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);

    if (scope === 'meta') {
      const data = await getMetaDashboard(userId, window);
      return res.json({ success: true, data: { ...data, platform: 'meta', window } });
    }
    if (scope === 'tiktok') {
      const data = await getTikTokDashboard(userId, window);
      return res.json({ success: true, data: { ...data, platform: 'tiktok', window } });
    }

    const key = `ads:combined:dashboard:${userId}:${window.since}:${window.until}`;
    const { value: data, cached } = await getOrSetCached(key, 30000, async () => {
      const totals = await getAccountTotals(userId, window, 'combined');
      const topCampaigns = await getCampaignPerformance(userId, window, 'combined');
      const video = await getTikTokVideoMetrics(userId, window);
      const [metaConn, tiktokConn] = await Promise.all([getMetaConn(userId), getTikTokConn(userId)]);
      return {
        connected: Boolean(metaConn || tiktokConn),
        summary: totals,
        topCampaigns: topCampaigns.slice(0, 15),
        videoMetrics: video,
        platforms: {
          meta: Boolean(metaConn),
          tiktok: Boolean(tiktokConn),
        },
      };
    });

    res.json({ success: true, data: { ...data, platform: 'combined', window, cached } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

router.get('/trends', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const scope = normalizePlatformScope(String(req.query.platform || 'meta'));
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const key = `ads:trends:${scope}:${userId}:${window.since}:${window.until}`;
    const { value: trends, cached } = await getOrSetCached(key, 45000, () =>
      getAccountTrends(userId, window, scope)
    );
    res.json({ success: true, data: { trends, window, platform: scope, cached } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load trends' });
  }
});

router.get('/insights', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const scope = normalizePlatformScope(String(req.query.platform || 'meta'));
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const includeAi = req.query.ai !== '0';
    const data = await generateAdsIntelligence(userId, window, {
      refresh,
      includeAi,
      platform: scope,
    });
    res.json({ success: true, data: { ...data, platform: scope, window } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

export default router;
