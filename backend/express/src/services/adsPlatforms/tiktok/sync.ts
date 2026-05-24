import { logger } from '../../../config/logger';
import { pool } from '../../../config/db_pg';
import { generateAdsIntelligence } from '../../adsIntelligence/aiInsights';
import type { DateWindow } from '../../adsIntelligence/dateWindow';
import {
  fetchDailyInsights,
  listAdGroups,
  listAds,
  listCampaigns,
  refreshAccessToken,
  type TikTokInsightRow,
} from './client';
import { discoverMarketingAdvertisers } from './advertiserDiscovery';
import {
  ensureAccessToken,
  getConnectionByUserId,
  getSelectedAdAccountIds,
  updateSyncStatus,
  upsertAdAccounts,
} from './db';
import { normalizeTikTokMetrics } from './metricsNormalize';

const activeSyncs = new Map<
  number,
  Promise<{ success: boolean; accountsSynced: number; insightRows: number; error?: string }>
>();

function dateRange(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

function flattenInsightRow(row: TikTokInsightRow): Record<string, string | number | undefined> {
  const dims = (row as { dimensions?: Record<string, unknown> }).dimensions;
  const metrics = (row as { metrics?: Record<string, unknown> }).metrics;
  if (dims || metrics) {
    const flat: Record<string, string | number | undefined> = {};
    for (const [k, v] of Object.entries(dims || {})) {
      flat[k] = v != null ? String(v) : undefined;
    }
    for (const [k, v] of Object.entries(metrics || {})) {
      flat[k] = typeof v === 'number' ? v : v != null ? String(v) : undefined;
    }
    return flat;
  }
  return row;
}

function entityIdFromRow(
  level: 'campaign' | 'adset' | 'ad',
  row: Record<string, string | number | undefined>
): string | null {
  if (level === 'campaign') return row.campaign_id ? String(row.campaign_id) : null;
  if (level === 'adset') return row.adgroup_id ? String(row.adgroup_id) : null;
  return row.ad_id ? String(row.ad_id) : null;
}

function metricDateFromRow(row: Record<string, string | number | undefined>): string | null {
  const d = row.stat_time_day || row.metric_date || row.date;
  if (!d) return null;
  return String(d).slice(0, 10);
}

async function upsertCampaigns(
  adAccountDbId: number,
  campaigns: { campaign_id: string; campaign_name?: string; operation_status?: string; objective_type?: string }[]
) {
  for (const c of campaigns) {
    await pool.query(
      `INSERT INTO tiktok_campaigns (ad_account_id, campaign_id, name, status, objective, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (ad_account_id, campaign_id) DO UPDATE SET
         name = EXCLUDED.name, status = EXCLUDED.status, objective = EXCLUDED.objective, synced_at = NOW()`,
      [
        adAccountDbId,
        c.campaign_id,
        c.campaign_name || null,
        c.operation_status || null,
        c.objective_type || null,
      ]
    );
  }
}

async function upsertAdGroups(
  adAccountDbId: number,
  groups: { adgroup_id: string; adgroup_name?: string; campaign_id?: string; operation_status?: string }[]
) {
  for (const g of groups) {
    await pool.query(
      `INSERT INTO tiktok_adgroups (ad_account_id, adgroup_id, campaign_id, name, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (ad_account_id, adgroup_id) DO UPDATE SET
         campaign_id = EXCLUDED.campaign_id, name = EXCLUDED.name, status = EXCLUDED.status, synced_at = NOW()`,
      [adAccountDbId, g.adgroup_id, g.campaign_id || null, g.adgroup_name || null, g.operation_status || null]
    );
  }
}

async function upsertAds(
  adAccountDbId: number,
  ads: {
    ad_id: string;
    ad_name?: string;
    adgroup_id?: string;
    campaign_id?: string;
    operation_status?: string;
    creative_id?: string;
  }[]
) {
  for (const a of ads) {
    await pool.query(
      `INSERT INTO tiktok_ads (ad_account_id, ad_id, adgroup_id, campaign_id, name, status, creative_id, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (ad_account_id, ad_id) DO UPDATE SET
         adgroup_id = EXCLUDED.adgroup_id, campaign_id = EXCLUDED.campaign_id,
         name = EXCLUDED.name, status = EXCLUDED.status, creative_id = EXCLUDED.creative_id, synced_at = NOW()`,
      [
        adAccountDbId,
        a.ad_id,
        a.adgroup_id || null,
        a.campaign_id || null,
        a.ad_name || null,
        a.operation_status || null,
        a.creative_id || null,
      ]
    );
  }
}

async function upsertInsights(
  adAccountDbId: number,
  level: 'campaign' | 'adset' | 'ad',
  rows: TikTokInsightRow[]
): Promise<number> {
  let count = 0;
  for (const raw of rows) {
    const row = flattenInsightRow(raw);
    const entityId = entityIdFromRow(level, row);
    const metricDate = metricDateFromRow(row);
    if (!entityId || !metricDate) continue;

    const m = normalizeTikTokMetrics(row);
    await pool.query(
      `INSERT INTO tiktok_insights_daily (
        ad_account_id, entity_type, entity_external_id, metric_date,
        spend, impressions, clicks, ctr, cpc, cpm, purchases, purchase_value, roas,
        frequency, reach, video_views, video_watched_2s, video_watched_6s,
        hook_rate, thumbstop_ratio, hold_rate, attribution_window, synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
      ON CONFLICT (ad_account_id, entity_type, entity_external_id, metric_date) DO UPDATE SET
        spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm,
        purchases = EXCLUDED.purchases, purchase_value = EXCLUDED.purchase_value, roas = EXCLUDED.roas,
        frequency = EXCLUDED.frequency, reach = EXCLUDED.reach,
        video_views = EXCLUDED.video_views, video_watched_2s = EXCLUDED.video_watched_2s,
        video_watched_6s = EXCLUDED.video_watched_6s,
        hook_rate = EXCLUDED.hook_rate, thumbstop_ratio = EXCLUDED.thumbstop_ratio,
        hold_rate = EXCLUDED.hold_rate, attribution_window = EXCLUDED.attribution_window,
        synced_at = NOW()`,
      [
        adAccountDbId,
        level,
        entityId,
        metricDate,
        m.spend,
        m.impressions,
        m.clicks,
        m.ctr,
        m.cpc,
        m.cpm,
        m.purchases,
        m.purchase_value,
        m.roas,
        m.frequency,
        m.reach,
        m.video_views,
        m.video_watched_2s,
        m.video_watched_6s,
        m.hook_rate,
        m.thumbstop_ratio,
        m.hold_rate,
        m.attribution_window,
      ]
    );
    count++;
  }
  return count;
}

export async function syncTikTokAdsForUser(
  userId: number,
  days = 14
): Promise<{ success: boolean; accountsSynced: number; insightRows: number; error?: string }> {
  const ongoing = activeSyncs.get(userId);
  if (ongoing) return ongoing;

  const task = (async () => {
    const conn = await getConnectionByUserId(userId);
    if (!conn || conn.status !== 'connected') {
      return { success: false, accountsSynced: 0, insightRows: 0, error: 'TikTok not connected' };
    }

    const selectedCount = await getSelectedAdAccountIds(conn.id);
    if (!selectedCount.length) {
      return {
        success: false,
        accountsSynced: 0,
        insightRows: 0,
        error: 'No TikTok advertiser accounts selected. Connect via Marketing API and select an ad account.',
      };
    }

    await updateSyncStatus(conn.id, 'running');

    try {
      const token = await ensureAccessToken(conn.id, refreshAccessToken);
      if (!token) {
        throw new Error('TikTok access token unavailable');
      }

      const advertisers = await discoverMarketingAdvertisers(token);
      if (advertisers.length) {
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
      }

      const selectedIds = await getSelectedAdAccountIds(conn.id);
      const accountRows = selectedIds.length
        ? await pool.query(
            `SELECT id, advertiser_id FROM tiktok_ad_accounts WHERE connection_id = $1 AND id = ANY($2::int[])`,
            [conn.id, selectedIds]
          )
        : await pool.query(`SELECT id, advertiser_id FROM tiktok_ad_accounts WHERE connection_id = $1`, [
            conn.id,
          ]);

      const { since, until } = dateRange(days);
      let totalInsights = 0;

      for (const acct of accountRows.rows) {
        const dbId = acct.id as number;
        const advertiserId = acct.advertiser_id as string;

        const [campaigns, adgroups, ads] = await Promise.all([
          listCampaigns(token, advertiserId),
          listAdGroups(token, advertiserId),
          listAds(token, advertiserId),
        ]);

        await upsertCampaigns(dbId, campaigns);
        await upsertAdGroups(dbId, adgroups);
        await upsertAds(dbId, ads);

        for (const level of ['campaign', 'adset', 'ad'] as const) {
          const insights = await fetchDailyInsights(token, advertiserId, level, since, until);
          totalInsights += await upsertInsights(dbId, level, insights);
        }
      }

      await updateSyncStatus(conn.id, 'success');
      logger.info('TikTok ads sync complete', { userId, accounts: accountRows.rowCount, totalInsights });

      try {
        const intelligenceWindow: DateWindow = { since, until, days, preset: 'custom' };
        await generateAdsIntelligence(userId, intelligenceWindow, {
          refresh: true,
          includeAi: true,
          platform: 'tiktok',
        });
      } catch (e) {
        logger.warn('Post-sync TikTok intelligence failed', {
          error: e instanceof Error ? e.message : e,
        });
      }

      return {
        success: true,
        accountsSynced: accountRows.rowCount || 0,
        insightRows: totalInsights,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateSyncStatus(conn.id, 'error', msg);
      logger.error('TikTok ads sync failed', { userId, error: msg });
      return { success: false, accountsSynced: 0, insightRows: 0, error: msg };
    }
  })().finally(() => {
    activeSyncs.delete(userId);
  });

  activeSyncs.set(userId, task);
  return task;
}

export async function getTikTokDashboard(userId: number, window: DateWindow) {
  const conn = await getConnectionByUserId(userId);
  if (!conn) return { connected: false };

  const summary = await pool.query(
    `SELECT
      COALESCE(SUM(i.spend), 0)::float AS spend,
      COALESCE(AVG(NULLIF(i.ctr, 0)), 0)::float AS ctr,
      COALESCE(AVG(NULLIF(i.cpc, 0)), 0)::float AS cpc,
      COALESCE(AVG(NULLIF(i.cpm, 0)), 0)::float AS cpm,
      COALESCE(SUM(i.purchases), 0)::float AS purchases,
      COALESCE(SUM(i.purchase_value), 0)::float AS purchase_value,
      CASE WHEN COALESCE(SUM(i.spend), 0) > 0
        THEN (COALESCE(SUM(i.purchase_value), 0) / SUM(i.spend))::float ELSE 0 END AS roas,
      COALESCE(AVG(NULLIF(i.hook_rate, 0)), 0)::float AS hook_rate,
      COALESCE(AVG(NULLIF(i.thumbstop_ratio, 0)), 0)::float AS thumbstop_ratio,
      COALESCE(AVG(NULLIF(i.hold_rate, 0)), 0)::float AS hold_rate
     FROM tiktok_insights_daily i
     JOIN tiktok_ad_accounts a ON a.id = i.ad_account_id
     WHERE a.connection_id = $1 AND a.is_selected = true
       AND i.entity_type = 'campaign'
       AND i.metric_date >= $2::date AND i.metric_date <= $3::date`,
    [conn.id, window.since, window.until]
  );

  const topCampaigns = await pool.query(
    `SELECT i.entity_external_id AS campaign_id,
      COALESCE(c.name, i.entity_external_id) AS name,
      SUM(i.spend)::float AS spend,
      SUM(i.clicks)::bigint AS clicks,
      AVG(NULLIF(i.ctr, 0))::float AS ctr,
      AVG(NULLIF(i.cpc, 0))::float AS cpc,
      AVG(NULLIF(i.cpm, 0))::float AS cpm,
      SUM(i.purchases)::float AS purchases,
      CASE WHEN SUM(i.spend) > 0 THEN (SUM(i.purchase_value) / SUM(i.spend))::float ELSE 0 END AS roas,
      AVG(NULLIF(i.hook_rate, 0))::float AS hook_rate
     FROM tiktok_insights_daily i
     JOIN tiktok_ad_accounts a ON a.id = i.ad_account_id
     LEFT JOIN tiktok_campaigns c ON c.ad_account_id = a.id AND c.campaign_id = i.entity_external_id
     WHERE a.connection_id = $1 AND a.is_selected = true
       AND i.entity_type = 'campaign'
       AND i.metric_date >= $2::date AND i.metric_date <= $3::date
     GROUP BY i.entity_external_id, c.name
     ORDER BY spend DESC LIMIT 10`,
    [conn.id, window.since, window.until]
  );

  const accounts = await pool.query(
    `SELECT id, advertiser_id AS ad_account_id, name, currency, is_selected
     FROM tiktok_ad_accounts WHERE connection_id = $1`,
    [conn.id]
  );

  return {
    connected: true,
    connection: {
      status: conn.status,
      lastSyncAt: conn.last_sync_at,
      lastSyncStatus: conn.last_sync_status,
      lastSyncError: conn.last_sync_error,
    },
    accounts: accounts.rows,
    summary: summary.rows[0],
    topCampaigns: topCampaigns.rows,
    window,
  };
}
