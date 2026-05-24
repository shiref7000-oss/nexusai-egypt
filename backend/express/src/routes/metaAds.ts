import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import {
  deleteConnection,
  getAdAccountsForConnection,
  getConnectionByUserId,
  setAdAccountSelected,
  upsertConnection,
  upsertAdAccounts,
} from '../services/metaAds/db';
import {
  exchangeCodeForToken,
  exchangeLongLivedToken,
  getMetaUser,
  listAdAccounts,
} from '../services/metaAds/graphClient';
import { getMetaDashboard, syncMetaAdsForUser } from '../services/metaAds/sync';
import { generateAdsIntelligence } from '../services/adsIntelligence/aiInsights';
import { getAccountTrends, getCampaignDrillDown } from '../services/adsIntelligence/metricsRepository';
import { listAlerts, resolveAlert } from '../services/adsIntelligence/alerts';
import { normalizePlatform, normalizePlatformScope } from '../services/adsPlatforms/registry';
import type { AdsPlatformId } from '../services/adsPlatforms/types';
import { withTimeout } from '../utils/queryTimeout';
import { getDateWindowFromQuery } from '../services/adsIntelligence/dateWindow';
import { getOrSetCached } from '../services/adsIntelligence/requestCache';
import {
  resolveWorkspaceUserId,
  sendWorkspaceDebug,
  wantsWorkspaceDebug,
} from '../utils/workspaceContext';

const router = Router();

const META_SCOPES = ['ads_read', 'ads_management', 'business_management'].join(',');

function metaRedirectUri(): string {
  return env.META_REDIRECT_URI || `${env.API_BASE_URL.replace(/\/$/, '')}/api/meta/oauth/callback`;
}

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

// ============================================================
// OAuth (callback is public)
// ============================================================
router.get('/oauth/callback', async (req, res) => {
  const frontend = env.FRONTEND_URL.replace(/\/$/, '');
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const err = String(req.query.error || '');

    if (err) {
      return res.redirect(`${frontend}/meta-ads?error=${encodeURIComponent(err)}`);
    }
    if (!code || !state) {
      return res.redirect(`${frontend}/meta-ads?error=missing_code`);
    }

    const userId = verifyOAuthState(state);
    const redirectUri = metaRedirectUri();

    let tokenData = await exchangeCodeForToken(code, redirectUri);
    try {
      const long = await exchangeLongLivedToken(tokenData.access_token);
      tokenData = { access_token: long.access_token, expires_in: long.expires_in };
    } catch (e) {
      logger.warn('Long-lived token exchange failed, using short-lived', {
        error: e instanceof Error ? e.message : e,
      });
    }

    const metaUser = await getMetaUser(tokenData.access_token);
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    const conn = await upsertConnection({
      userId,
      metaUserId: metaUser.id,
      accessToken: tokenData.access_token,
      tokenExpiresAt: expiresAt,
    });

    const accounts = await listAdAccounts(tokenData.access_token);
    await upsertAdAccounts(
      conn.id,
      accounts.map((a) => ({
        ad_account_id: a.id,
        name: a.name,
        currency: a.currency,
        account_status: a.account_status != null ? String(a.account_status) : undefined,
      }))
    );

    res.redirect(`${frontend}/meta-ads?connected=1`);
  } catch (e: unknown) {
    logger.error('Meta OAuth callback error', { error: e instanceof Error ? e.message : e });
    res.redirect(`${frontend}/meta-ads?error=oauth_failed`);
  }
});

router.use(authenticate);

router.get('/oauth/start', async (req: AuthenticatedRequest, res) => {
  const userId = await workspaceUserId(req, res);
  if (!userId) return;
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    return res.status(503).json({ success: false, error: 'Meta app not configured on server' });
  }

  const state = signOAuthState(userId);
  const redirectUri = encodeURIComponent(metaRedirectUri());
  const url =
    `https://www.facebook.com/${env.META_GRAPH_VERSION || 'v21.0'}/dialog/oauth?` +
    `client_id=${env.META_APP_ID}&redirect_uri=${redirectUri}&state=${state}&scope=${encodeURIComponent(META_SCOPES)}&response_type=code`;

  res.json({ success: true, data: { url } });
});

router.get('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;

    const conn = await getConnectionByUserId(userId);
    if (!conn) {
      return res.json({ success: true, data: { connected: false } });
    }

    const accounts = await getAdAccountsForConnection(conn.id);
    res.json({
      success: true,
      data: {
        connected: true,
        metaUserId: conn.meta_user_id,
        status: conn.status,
        lastSyncAt: conn.last_sync_at,
        lastSyncStatus: conn.last_sync_status,
        lastSyncError: conn.last_sync_error,
        accounts,
      },
    });
  } catch (err: unknown) {
    logger.error('Meta status error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load Meta status' });
  }
});

router.post('/sync', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;

    const days = Math.min(30, Math.max(1, parseInt(String(req.body?.days || 14), 10) || 14));
    const result = await syncMetaAdsForUser(userId, days);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Sync failed', data: result });
    }
    res.json({ success: true, data: result });
  } catch (err: unknown) {
    logger.error('Meta sync error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

router.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const key = `meta:dashboard:${userId}:${window.since}:${window.until}`;
    const { value: data, cached } = await getOrSetCached(key, 30000, () => getMetaDashboard(userId, window));
    res.json({ success: true, data: { ...data, window, cached } });
  } catch (err: unknown) {
    logger.error('Meta dashboard error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

router.patch('/ad-accounts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
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
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const key = `meta:trends:${userId}:${window.since}:${window.until}`;
    const scope = normalizePlatformScope(String(req.query.platform || 'meta'));
    const { value: trends, cached } = await getOrSetCached(key, 45000, () =>
      getAccountTrends(userId, window, scope)
    );
    res.json({ success: true, data: { trends, window, platform: scope, cached } });
  } catch (err: unknown) {
    logger.error('Meta trends error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load trends' });
  }
});

router.get('/insights', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const includeAi = req.query.ai !== '0';
    const scope = normalizePlatformScope(String(req.query.platform || 'meta'));
    const data = await generateAdsIntelligence(userId, window, {
      refresh,
      includeAi,
      platform: scope,
    });
    res.json({ success: true, data: { ...data, platform: scope, window } });
  } catch (err: unknown) {
    logger.error('Meta insights error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

router.get('/campaigns/:campaignId', async (req: AuthenticatedRequest, res) => {
  const started = Date.now();
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const campaignId = String(req.params.campaignId);
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const platform = normalizePlatform(String(req.query.platform || 'meta')) as AdsPlatformId;
    const key = `${platform}:campaign:${userId}:${campaignId}:${window.since}:${window.until}`;

    const { value: drillDown, cached } = await getOrSetCached(key, 30000, () =>
      withTimeout(
        getCampaignDrillDown(userId, campaignId, window, platform),
        12000,
        'getCampaignDrillDown'
      )
    );

    const ms = Date.now() - started;
    logger.info('Campaign drill-down', { userId, campaignId, platform, ms, cached });

    if (!drillDown) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, data: { ...drillDown, platform, window, _timingMs: ms, cached } });
  } catch (err: unknown) {
    const ms = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Meta campaign drill-down error', { error: msg, ms });
    const status = msg.includes('timed out') ? 504 : 500;
    res.status(status).json({ success: false, error: msg.includes('timed out') ? 'Campaign load timed out' : 'Failed to load campaign' });
  }
});

router.get('/alerts', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    const platform = normalizePlatform(String(req.query.platform || 'meta'));
    const status = (['open', 'resolved', 'all'].includes(String(req.query.status))
      ? String(req.query.status)
      : 'open') as 'open' | 'resolved' | 'all';
    const window = getDateWindowFromQuery(req.query as Record<string, unknown>);
    const alerts = await listAlerts(userId, platform, status, 50, window);
    res.json({ success: true, data: { alerts, platform, window } });
  } catch (err: unknown) {
    logger.error('Meta alerts error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load alerts' });
  }
});

router.patch('/alerts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
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
    const userId = await workspaceUserId(req, res);
    if (!userId) return;
    await deleteConnection(userId);
    res.json({ success: true, data: { connected: false } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Disconnect failed' });
  }
});

export default router;
