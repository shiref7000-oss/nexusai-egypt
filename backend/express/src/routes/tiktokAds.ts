import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import {
  countSelectedAdAccounts,
  deleteConnection,
  ensureAccessToken,
  getAdAccountsForConnection,
  getConnectionByUserId,
  setAdAccountSelected,
  upsertConnection,
  upsertAdAccounts,
} from '../services/adsPlatforms/tiktok/db';
import {
  discoverMarketingAdvertisers,
  discoverMarketingAdvertisersFromAuthCode,
  getMarketingOAuthUrl,
} from '../services/adsPlatforms/tiktok/advertiserDiscovery';
import { refreshAccessToken } from '../services/adsPlatforms/tiktok/client';
import { syncTikTokAdsForUser, getTikTokDashboard } from '../services/adsPlatforms/tiktok/sync';
import { generateAdsIntelligence } from '../services/adsIntelligence/aiInsights';
import { getAccountTrends, getCampaignDrillDown } from '../services/adsIntelligence/metricsRepository';
import { listAlerts, resolveAlert } from '../services/adsIntelligence/alerts';
import { getDateWindowFromQuery } from '../services/adsIntelligence/dateWindow';
import { getOrSetCached } from '../services/adsIntelligence/requestCache';
import { withTimeout } from '../utils/queryTimeout';

const router = Router();

function tiktokRedirectUri(): string {
  return env.TIKTOK_REDIRECT_URI || `${env.API_BASE_URL.replace(/\/$/, '')}/api/tiktok/oauth/callback`;
}

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

function signOAuthState(userId: number): string {
  return jwt.sign({ userId, n: crypto.randomBytes(8).toString('hex') }, env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

function verifyOAuthState(state: string): number {
  const payload = jwt.verify(state, env.JWT_SECRET) as { userId: number };
  if (!payload?.userId) throw new Error('Invalid OAuth state');
  return payload.userId;
}

router.get('/oauth/callback', async (req, res) => {
  const frontend = env.FRONTEND_URL.replace(/\/$/, '');
  try {
    const authCode = String(req.query.auth_code || req.query.code || '');
    const state = String(req.query.state || '');
    const err = String(req.query.error || '');

    if (err) {
      return res.redirect(`${frontend}/meta-ads?platform=tiktok&error=${encodeURIComponent(err)}`);
    }
    if (!authCode || !state) {
      return res.redirect(`${frontend}/meta-ads?platform=tiktok&error=missing_code`);
    }

    const userId = verifyOAuthState(state);
    const discovery = await discoverMarketingAdvertisersFromAuthCode(authCode);
    const tokenData = discovery.token;
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;
    const refreshExpiresAt = tokenData.refresh_token_expires_in
      ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
      : null;

    const conn = await upsertConnection({
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenExpiresAt: expiresAt,
      refreshExpiresAt: refreshExpiresAt,
      tokenScopeType: 'marketing',
    });

    if (!discovery.advertisers.length) {
      return res.redirect(
        `${frontend}/meta-ads?platform=tiktok&error=no_advertiser_accounts&detail=${encodeURIComponent(
          'No TikTok Ads advertiser accounts returned. Use a TikTok For Business app with Marketing API enabled and authorize with an Ads Manager account (not creator Login Kit scopes).'
        )}`
      );
    }

    await upsertAdAccounts(
      conn.id,
      discovery.advertisers.map((a) => ({
        advertiser_id: a.advertiser_id,
        advertiser_name: a.advertiser_name,
        currency: a.currency,
        status: a.status,
        timezone: a.timezone,
      })),
      { defaultSelectSingle: true }
    );

    const selectParam =
      discovery.advertisers.length > 1 ? '&select_advertisers=1' : '';
    res.redirect(
      `${frontend}/meta-ads?platform=tiktok&connected=1&advertisers=${discovery.advertisers.length}${selectParam}`
    );
  } catch (e: unknown) {
    logger.error('TikTok OAuth callback error', { error: e instanceof Error ? e.message : e });
    res.redirect(`${frontend}/meta-ads?platform=tiktok&error=oauth_failed`);
  }
});

router.use(authenticate);

router.get('/oauth/start', (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) {
    return res.status(400).json({ success: false, error: 'User not linked to database account' });
  }
  if (!env.TIKTOK_APP_ID || !env.TIKTOK_APP_SECRET) {
    return res.status(503).json({ success: false, error: 'TikTok app not configured on server' });
  }

  const state = signOAuthState(userId);
  const url = getMarketingOAuthUrl(state, tiktokRedirectUri());
  res.json({
    success: true,
    data: {
      url,
      authType: 'marketing',
      hint: 'Authorize with TikTok Ads Manager (Marketing API). Creator Login Kit scopes will not return advertiser accounts.',
    },
  });
});

router.get('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }

    const conn = await getConnectionByUserId(userId);
    if (!conn) {
      return res.json({ success: true, data: { connected: false } });
    }

    const accounts = await getAdAccountsForConnection(conn.id);
    const selectedCount = await countSelectedAdAccounts(conn.id);
    res.json({
      success: true,
      data: {
        connected: true,
        authType: 'marketing',
        tiktokUserId: conn.tiktok_user_id,
        status: conn.status,
        lastSyncAt: conn.last_sync_at,
        lastSyncStatus: conn.last_sync_status,
        lastSyncError: conn.last_sync_error,
        advertiserCount: accounts.length,
        selectedAdvertiserCount: selectedCount,
        needsAdvertiserSelection: accounts.length > 1 && selectedCount === 0,
        accounts,
      },
    });
  } catch (err: unknown) {
    logger.error('TikTok status error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load TikTok status' });
  }
});

router.post('/advertisers/refresh', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const conn = await getConnectionByUserId(userId);
    if (!conn) {
      return res.status(404).json({ success: false, error: 'Not connected' });
    }
    const token = await ensureAccessToken(conn.id, refreshAccessToken);
    if (!token) {
      return res.status(400).json({ success: false, error: 'Access token unavailable' });
    }
    const advertisers = await discoverMarketingAdvertisers(token);
    if (!advertisers.length) {
      return res.status(400).json({
        success: false,
        error:
          'No advertiser accounts from Marketing API. Re-authorize with TikTok Ads Manager at business-api.tiktok.com portal.',
      });
    }
    await upsertAdAccounts(
      conn.id,
      advertisers.map((a) => ({
        advertiser_id: a.advertiser_id,
        advertiser_name: a.advertiser_name,
        currency: a.currency,
        status: a.status,
        timezone: a.timezone,
      })),
      { defaultSelectSingle: false }
    );
    const accounts = await getAdAccountsForConnection(conn.id);
    res.json({ success: true, data: { advertisers: accounts, count: accounts.length } });
  } catch (err: unknown) {
    logger.error('TikTok advertiser refresh error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to refresh advertisers' });
  }
});

router.post('/sync', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }

    const days = Math.min(30, Math.max(1, parseInt(String(req.body?.days || 14), 10) || 14));
    const result = await syncTikTokAdsForUser(userId, days);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Sync failed', data: result });
    }
    res.json({ success: true, data: result });
  } catch (err: unknown) {
    logger.error('TikTok sync error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

router.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const key = `tiktok:dashboard:${userId}:${window.since}:${window.until}`;
    const { value: data, cached } = await getOrSetCached(key, 30000, () => getTikTokDashboard(userId, window));
    res.json({ success: true, data: { ...data, window, platform: 'tiktok', cached } });
  } catch (err: unknown) {
    logger.error('TikTok dashboard error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

router.patch('/ad-accounts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const conn = await getConnectionByUserId(userId);
    if (!conn) {
      return res.status(404).json({ success: false, error: 'Not connected' });
    }
    const accountId = parseInt(String(req.params.id), 10);
    const selected = Boolean(req.body?.isSelected ?? req.body?.is_selected ?? true);
    await setAdAccountSelected(conn.id, accountId, selected);
    const accounts = await getAdAccountsForConnection(conn.id);
    res.json({ success: true, data: { accounts } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Update failed' });
  }
});

router.get('/trends', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const key = `tiktok:trends:${userId}:${window.since}:${window.until}`;
    const { value: trends, cached } = await getOrSetCached(key, 45000, () =>
      getAccountTrends(userId, window, 'tiktok')
    );
    res.json({ success: true, data: { trends, window, platform: 'tiktok', cached } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load trends' });
  }
});

router.get('/insights', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const includeAi = req.query.ai !== '0';
    const data = await generateAdsIntelligence(userId, window, {
      refresh,
      includeAi,
      platform: 'tiktok',
    });
    res.json({ success: true, data: { ...data, platform: 'tiktok', window } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

router.get('/campaigns/:campaignId', async (req: AuthenticatedRequest, res) => {
  const started = Date.now();
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const campaignId = String(req.params.campaignId);
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const key = `tiktok:campaign:${userId}:${campaignId}:${window.since}:${window.until}`;
    const { value: drillDown, cached } = await getOrSetCached(key, 30000, () =>
      withTimeout(getCampaignDrillDown(userId, campaignId, window, 'tiktok'), 12000, 'getCampaignDrillDown')
    );

    const ms = Date.now() - started;
    logger.info('TikTok campaign drill-down', { userId, campaignId, ms, cached });

    if (!drillDown) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, data: { ...drillDown, platform: 'tiktok', window, _timingMs: ms, cached } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('TikTok campaign drill-down error', { error: msg, ms: Date.now() - started });
    const status = msg.includes('timed out') ? 504 : 500;
    res.status(status).json({ success: false, error: msg.includes('timed out') ? 'Campaign load timed out' : 'Failed to load campaign' });
  }
});

router.get('/alerts', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const status = (['open', 'resolved', 'all'].includes(String(req.query.status))
      ? String(req.query.status)
      : 'open') as 'open' | 'resolved' | 'all';
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const alerts = await listAlerts(userId, 'tiktok', status, 50, window);
    res.json({ success: true, data: { alerts, platform: 'tiktok', window } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load alerts' });
  }
});

router.patch('/alerts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const alertId = parseInt(String(req.params.id), 10);
    const ok = await resolveAlert(userId, alertId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    res.json({ success: true, data: { resolved: true } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to resolve alert' });
  }
});

router.delete('/connection', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    await deleteConnection(userId);
    res.json({ success: true, data: { connected: false } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Disconnect failed' });
  }
});

export default router;
