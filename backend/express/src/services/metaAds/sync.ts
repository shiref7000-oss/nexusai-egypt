import { logger } from '../../config/logger';
import {
  fetchDailyInsights,
  listAdSets,
  listAds,
  listAdAccounts,
  listCampaigns,
} from './graphClient';
import { computeCommerceMetricsForInsight } from './metaCommerceMetrics';
import {
  getConnectionByUserId,
  getSelectedAdAccountIds,
  updateSyncStatus,
  upsertAdAccounts,
} from './db';
import { pool } from '../../config/db_pg';
import { generateAdsIntelligence } from '../adsIntelligence/aiInsights';
import type { DateWindow } from '../adsIntelligence/dateWindow';

const activeSyncs = new Map<number, Promise<{ success: boolean; accountsSynced: number; insightRows: number; error?: string }>>();

function dateRange(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

async function upsertCampaigns(adAccountDbId: number, campaigns: { id: string; name?: string; status?: string; objective?: string }[]) {
  for (const c of campaigns) {
    await pool.query(
      `INSERT INTO meta_campaigns (ad_account_id, campaign_id, name, status, objective, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (ad_account_id, campaign_id) DO UPDATE SET
         name = EXCLUDED.name, status = EXCLUDED.status, objective = EXCLUDED.objective, synced_at = NOW()`,
      [adAccountDbId, c.id, c.name || null, c.status || null, c.objective || null]
    );
  }
}

async function upsertAdSets(
  adAccountDbId: number,
  adsets: { id: string; name?: string; status?: string; campaign_id?: string }[]
) {
  for (const a of adsets) {
    await pool.query(
      `INSERT INTO meta_adsets (ad_account_id, adset_id, campaign_id, name, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (ad_account_id, adset_id) DO UPDATE SET
         campaign_id = EXCLUDED.campaign_id, name = EXCLUDED.name, status = EXCLUDED.status, synced_at = NOW()`,
      [adAccountDbId, a.id, a.campaign_id || null, a.name || null, a.status || null]
    );
  }
}

async function upsertAds(
  adAccountDbId: number,
  ads: {
    id: string;
    name?: string;
    status?: string;
    adset_id?: string;
    campaign_id?: string;
    creative?: { id?: string; name?: string; thumbnail_url?: string };
  }[]
) {
  for (const a of ads) {
    const cr = a.creative;
    await pool.query(
      `INSERT INTO meta_ads (
        ad_account_id, ad_id, adset_id, campaign_id, name, status,
        creative_id, creative_name, creative_thumbnail_url, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (ad_account_id, ad_id) DO UPDATE SET
         adset_id = EXCLUDED.adset_id, campaign_id = EXCLUDED.campaign_id,
         name = EXCLUDED.name, status = EXCLUDED.status,
         creative_id = EXCLUDED.creative_id,
         creative_name = EXCLUDED.creative_name,
         creative_thumbnail_url = EXCLUDED.creative_thumbnail_url,
         synced_at = NOW()`,
      [
        adAccountDbId,
        a.id,
        a.adset_id || null,
        a.campaign_id || null,
        a.name || null,
        a.status || null,
        cr?.id || null,
        cr?.name || null,
        cr?.thumbnail_url || null,
      ]
    );
  }
}

async function upsertInsights(
  adAccountDbId: number,
  level: 'campaign' | 'adset' | 'ad',
  rows: Awaited<ReturnType<typeof fetchDailyInsights>>,
  objectiveByCampaignId: Map<string, string | null>
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const entityId =
      level === 'campaign' ? row.campaign_id : level === 'adset' ? row.adset_id : row.ad_id;
    const metricDate = row.date_start || row.date_stop;
    if (!entityId || !metricDate) continue;

    const spend = parseFloat(row.spend || '0') || 0;
    const impressions = parseInt(row.impressions || '0', 10) || 0;
    const clicks = parseInt(row.clicks || '0', 10) || 0;
    const ctr = parseFloat(row.ctr || '0') || 0;
    const cpc = parseFloat(row.cpc || '0') || 0;
    const cpm = parseFloat(row.cpm || '0') || 0;
    const campaignIdForObjective =
      level === 'campaign'
        ? entityId
        : row.campaign_id
          ? String(row.campaign_id)
          : null;
    const objective = campaignIdForObjective
      ? objectiveByCampaignId.get(campaignIdForObjective) ?? null
      : null;

    const { purchases, purchase_value, roas } = computeCommerceMetricsForInsight(objective, row, spend);
    const frequency = parseFloat(row.frequency || '0') || 0;
    const reach = parseInt(row.reach || '0', 10) || 0;

    await pool.query(
      `INSERT INTO meta_insights_daily (
        ad_account_id, entity_type, entity_external_id, metric_date,
        spend, impressions, clicks, ctr, cpc, cpm, purchases, purchase_value, roas,
        frequency, reach, synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      ON CONFLICT (ad_account_id, entity_type, entity_external_id, metric_date) DO UPDATE SET
        spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm,
        purchases = EXCLUDED.purchases, purchase_value = EXCLUDED.purchase_value,
        roas = EXCLUDED.roas, frequency = EXCLUDED.frequency, reach = EXCLUDED.reach,
        synced_at = NOW()`,
      [
        adAccountDbId,
        level,
        entityId,
        metricDate,
        spend,
        impressions,
        clicks,
        ctr,
        cpc,
        cpm,
        purchases,
        purchase_value,
        roas,
        frequency,
        reach,
      ]
    );
    count++;
  }
  return count;
}

export async function syncMetaAdsForUser(userId: number, days = 14): Promise<{
  success: boolean;
  accountsSynced: number;
  insightRows: number;
  error?: string;
}> {
  const ongoing = activeSyncs.get(userId);
  if (ongoing) {
    return ongoing;
  }

  const task = (async () => {
  const conn = await getConnectionByUserId(userId);
  if (!conn || conn.status !== 'connected') {
    return { success: false, accountsSynced: 0, insightRows: 0, error: 'Meta not connected' };
  }

  await updateSyncStatus(conn.id, 'running');

  try {
    const token = conn.access_token;
    const graphAccounts = await listAdAccounts(token);
    await upsertAdAccounts(
      conn.id,
      graphAccounts.map((a) => ({
        ad_account_id: a.id,
        name: a.name,
        currency: a.currency,
        account_status: a.account_status != null ? String(a.account_status) : undefined,
      }))
    );

    const selectedIds = await getSelectedAdAccountIds(conn.id);
    const accountRows = selectedIds.length
      ? await pool.query(
          `SELECT id, ad_account_id FROM meta_ad_accounts WHERE connection_id = $1 AND id = ANY($2::int[])`,
          [conn.id, selectedIds]
        )
      : await pool.query(
          `SELECT id, ad_account_id FROM meta_ad_accounts WHERE connection_id = $1`,
          [conn.id]
        );

    const { since, until } = dateRange(days);
    let totalInsights = 0;

    for (const acct of accountRows.rows) {
      const dbId = acct.id as number;
      const actId = acct.ad_account_id as string;

      const [campaigns, adsets, ads] = await Promise.all([
        listCampaigns(token, actId),
        listAdSets(token, actId),
        listAds(token, actId),
      ]);

      await upsertCampaigns(dbId, campaigns);
      await upsertAdSets(dbId, adsets);
      await upsertAds(dbId, ads);

      const objRes = await pool.query(
        `SELECT campaign_id, objective FROM meta_campaigns WHERE ad_account_id = $1`,
        [dbId]
      );
      const objectiveByCampaignId = new Map<string, string | null>();
      for (const r of objRes.rows) {
        objectiveByCampaignId.set(String(r.campaign_id), r.objective ? String(r.objective) : null);
      }

      for (const level of ['campaign', 'adset', 'ad'] as const) {
        const insights = await fetchDailyInsights(token, actId, level, since, until);
        totalInsights += await upsertInsights(dbId, level, insights, objectiveByCampaignId);
      }
    }

    await updateSyncStatus(conn.id, 'success');
    logger.info('Meta ads sync complete', { userId, accounts: accountRows.rowCount, totalInsights });

    try {
      const intelligenceWindow: DateWindow = { since, until, days, preset: 'custom' };
      await generateAdsIntelligence(userId, intelligenceWindow, {
        refresh: true,
        includeAi: true,
        platform: 'meta',
      });
    } catch (e) {
      logger.warn('Post-sync intelligence generation failed', {
        error: e instanceof Error ? e.message : e,
      });
    }

    try {
      const { addContextIntelligenceJob } = await import('../queue');
      await addContextIntelligenceJob({ type: 'match_campaigns', userId, platform: 'meta' });
    } catch (e) {
      logger.warn('Post-sync BCI campaign matching queue failed', {
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
    logger.error('Meta ads sync failed', { userId, error: msg });
    return { success: false, accountsSynced: 0, insightRows: 0, error: msg };
  }
  })().finally(() => {
    activeSyncs.delete(userId);
  });

  activeSyncs.set(userId, task);
  return task;
}

export async function getMetaDashboard(userId: number, window: DateWindow) {
  const conn = await getConnectionByUserId(userId);
  if (!conn) {
    return { connected: false };
  }

  const summary = await pool.query(
    `SELECT
      COALESCE(SUM(i.spend), 0)::float AS spend,
      COALESCE(AVG(NULLIF(i.ctr, 0)), 0)::float AS ctr,
      COALESCE(AVG(NULLIF(i.cpc, 0)), 0)::float AS cpc,
      COALESCE(AVG(NULLIF(i.cpm, 0)), 0)::float AS cpm,
      COALESCE(SUM(i.purchases), 0)::float AS purchases,
      COALESCE(SUM(i.purchase_value), 0)::float AS purchase_value,
      CASE WHEN COALESCE(SUM(i.spend), 0) > 0
        THEN (COALESCE(SUM(i.purchase_value), 0) / SUM(i.spend))::float
        ELSE 0 END AS roas
     FROM meta_insights_daily i
     JOIN meta_ad_accounts a ON a.id = i.ad_account_id
     WHERE a.connection_id = $1 AND a.is_selected = true
       AND i.entity_type = 'campaign'
       AND i.metric_date >= $2::date
       AND i.metric_date <= $3::date`,
    [conn.id, window.since, window.until]
  );

  const topCampaigns = await pool.query(
    `SELECT
      i.entity_external_id AS campaign_id,
      COALESCE(c.name, i.entity_external_id) AS name,
      SUM(i.spend)::float AS spend,
      SUM(i.clicks)::bigint AS clicks,
      AVG(NULLIF(i.ctr, 0))::float AS ctr,
      AVG(NULLIF(i.cpc, 0))::float AS cpc,
      AVG(NULLIF(i.cpm, 0))::float AS cpm,
      SUM(i.purchases)::float AS purchases,
      CASE WHEN SUM(i.spend) > 0 THEN (SUM(i.purchase_value) / SUM(i.spend))::float ELSE 0 END AS roas
     FROM meta_insights_daily i
     JOIN meta_ad_accounts a ON a.id = i.ad_account_id
     LEFT JOIN meta_campaigns c ON c.ad_account_id = a.id AND c.campaign_id = i.entity_external_id
     WHERE a.connection_id = $1 AND a.is_selected = true
       AND i.entity_type = 'campaign'
       AND i.metric_date >= $2::date
       AND i.metric_date <= $3::date
     GROUP BY i.entity_external_id, c.name
     ORDER BY spend DESC
     LIMIT 10`,
    [conn.id, window.since, window.until]
  );

  const accounts = await pool.query(
    `SELECT id, ad_account_id, name, currency, is_selected FROM meta_ad_accounts WHERE connection_id = $1`,
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
