import { pool } from '../../config/db_pg';
import { connectionIdForPlatform, PLATFORM_SCHEMAS } from '../adsPlatforms/platformSchema';
import type { AdsPlatformId, AdsPlatformScope, CampaignDrillDown, MetricTotals, TrendPoint } from '../adsPlatforms/types';
import type { DateWindow } from './dateWindow';

function rowToTotals(row: Record<string, unknown>): MetricTotals {
  return {
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpc: Number(row.cpc) || 0,
    cpm: Number(row.cpm) || 0,
    purchases: Number(row.purchases) || 0,
    purchase_value: Number(row.purchase_value) || 0,
    roas: Number(row.roas) || 0,
    frequency: Number(row.frequency) || 0,
    reach: Number(row.reach) || 0,
  };
}

const TOTALS_SELECT_I = `
  COALESCE(SUM(i.spend), 0)::float AS spend,
  COALESCE(SUM(i.impressions), 0)::bigint AS impressions,
  COALESCE(SUM(i.clicks), 0)::bigint AS clicks,
  COALESCE(AVG(NULLIF(i.ctr, 0)), 0)::float AS ctr,
  COALESCE(AVG(NULLIF(i.cpc, 0)), 0)::float AS cpc,
  COALESCE(AVG(NULLIF(i.cpm, 0)), 0)::float AS cpm,
  COALESCE(SUM(i.purchases), 0)::float AS purchases,
  COALESCE(SUM(i.purchase_value), 0)::float AS purchase_value,
  CASE WHEN COALESCE(SUM(i.spend), 0) > 0
    THEN (COALESCE(SUM(i.purchase_value), 0) / SUM(i.spend))::float ELSE 0 END AS roas,
  COALESCE(AVG(NULLIF(i.frequency, 0)), 0)::float AS frequency,
  COALESCE(SUM(i.reach), 0)::bigint AS reach
`;

const TOTALS_SELECT_SUB = TOTALS_SELECT_I.replace(/i\./g, 'sub.');

function platformsForScope(scope: AdsPlatformScope): AdsPlatformId[] {
  if (scope === 'combined') return ['meta', 'tiktok'];
  return [scope];
}

async function connectionIdsForScope(
  userId: number,
  scope: AdsPlatformScope
): Promise<Array<{ platform: AdsPlatformId; connectionId: number }>> {
  const out: Array<{ platform: AdsPlatformId; connectionId: number }> = [];
  for (const p of platformsForScope(scope)) {
    const id = await connectionIdForPlatform(userId, p);
    if (id) out.push({ platform: p, connectionId: id });
  }
  return out;
}

export async function getAccountTrends(
  userId: number,
  window: DateWindow,
  scope: AdsPlatformScope = 'meta'
): Promise<TrendPoint[]> {
  const conns = await connectionIdsForScope(userId, scope);
  if (!conns.length) return [];

  const parts = conns.map(({ platform, connectionId }) => {
    const s = PLATFORM_SCHEMAS[platform];
    return `
      SELECT i.metric_date::text AS date,
        SUM(i.spend)::float AS spend,
        SUM(i.purchase_value)::float AS purchase_value,
        SUM(i.purchases)::float AS purchases,
        AVG(NULLIF(i.ctr, 0))::float AS ctr,
        AVG(NULLIF(i.cpm, 0))::float AS cpm
      FROM ${s.insightsTable} i
      JOIN ${s.accountsTable} a ON a.id = i.ad_account_id
      WHERE a.connection_id = ${connectionId} AND a.is_selected = true
        AND i.entity_type = 'campaign'
        AND i.metric_date >= '${window.since}'::date
        AND i.metric_date <= '${window.until}'::date
      GROUP BY i.metric_date
    `;
  });

  const res = await pool.query(
    `SELECT date,
      SUM(spend)::float AS spend,
      CASE WHEN SUM(spend) > 0 THEN (SUM(purchase_value) / SUM(spend))::float ELSE 0 END AS roas,
      AVG(NULLIF(ctr, 0))::float AS ctr,
      SUM(purchases)::float AS purchases,
      AVG(NULLIF(cpm, 0))::float AS cpm
     FROM (${parts.join(' UNION ALL ')}) sub
     GROUP BY date
     ORDER BY date ASC`
  );

  return res.rows.map((r) => ({
    date: String(r.date),
    spend: Number(r.spend) || 0,
    roas: Number(r.roas) || 0,
    ctr: Number(r.ctr) || 0,
    purchases: Number(r.purchases) || 0,
    cpm: Number(r.cpm) || 0,
  }));
}

export async function getCampaignTrends(
  userId: number,
  campaignId: string,
  window: DateWindow,
  scope: AdsPlatformScope = 'meta',
  platformHint?: AdsPlatformId
): Promise<TrendPoint[]> {
  const platform =
    platformHint || (scope === 'combined' ? undefined : scope === 'tiktok' ? 'tiktok' : 'meta');
  if (!platform) return [];

  const connId = await connectionIdForPlatform(userId, platform);
  if (!connId) return [];

  const s = PLATFORM_SCHEMAS[platform];
  const res = await pool.query(
    `SELECT i.metric_date::text AS date,
      SUM(i.spend)::float AS spend,
      CASE WHEN SUM(i.spend) > 0 THEN (SUM(i.purchase_value) / SUM(i.spend))::float ELSE 0 END AS roas,
      AVG(NULLIF(i.ctr, 0))::float AS ctr,
      SUM(i.purchases)::float AS purchases,
      AVG(NULLIF(i.cpm, 0))::float AS cpm
     FROM ${s.insightsTable} i
     JOIN ${s.accountsTable} a ON a.id = i.ad_account_id
     WHERE a.connection_id = $1 AND a.is_selected = true
       AND i.entity_type = 'campaign'
       AND i.entity_external_id = $2
       AND i.metric_date >= $3::date AND i.metric_date <= $4::date
     GROUP BY i.metric_date
     ORDER BY i.metric_date ASC`,
    [connId, campaignId, window.since, window.until]
  );

  return res.rows.map((r) => ({
    date: String(r.date),
    spend: Number(r.spend) || 0,
    roas: Number(r.roas) || 0,
    ctr: Number(r.ctr) || 0,
    purchases: Number(r.purchases) || 0,
    cpm: Number(r.cpm) || 0,
  }));
}

export type CampaignPerformanceRow = {
  campaign_id: string;
  name: string;
  status: string | null;
  platform?: AdsPlatformId;
  metrics: MetricTotals;
};

export async function getCampaignPerformance(
  userId: number,
  window: DateWindow,
  scope: AdsPlatformScope = 'meta'
): Promise<CampaignPerformanceRow[]> {
  const conns = await connectionIdsForScope(userId, scope);
  if (!conns.length) return [];

  const parts = conns.map(({ platform, connectionId }) => {
    const s = PLATFORM_SCHEMAS[platform];
    return `
      SELECT '${platform}'::text AS platform,
        i.entity_external_id AS campaign_id,
        COALESCE(c.name, i.entity_external_id) AS name,
        c.status,
        ${TOTALS_SELECT_I}
      FROM ${s.insightsTable} i
      JOIN ${s.accountsTable} a ON a.id = i.ad_account_id
      LEFT JOIN ${s.campaignsTable} c ON c.ad_account_id = a.id AND c.campaign_id = i.entity_external_id
      WHERE a.connection_id = ${connectionId} AND a.is_selected = true
        AND i.entity_type = 'campaign'
        AND i.metric_date >= '${window.since}'::date
        AND i.metric_date <= '${window.until}'::date
      GROUP BY i.entity_external_id, c.name, c.status
    `;
  });

  const res = await pool.query(
    `SELECT platform, campaign_id, name, status, spend, impressions, clicks, ctr, cpc, cpm,
      purchases, purchase_value, roas, frequency, reach
     FROM (${parts.join(' UNION ALL ')}) sub
     ORDER BY spend DESC`
  );

  return res.rows.map((r) => ({
    campaign_id: String(r.campaign_id),
    name: String(r.name),
    status: r.status ? String(r.status) : null,
    platform: r.platform as AdsPlatformId,
    metrics: rowToTotals(r),
  }));
}

export async function getCampaignDrillDown(
  userId: number,
  campaignId: string,
  window: DateWindow,
  platform: AdsPlatformId = 'meta'
): Promise<CampaignDrillDown | null> {
  const connId = await connectionIdForPlatform(userId, platform);
  if (!connId) return null;

  const s = PLATFORM_SCHEMAS[platform];
  const adsetTable = s.adsetsTable;
  const adsetCol = s.adsetIdCol;

  const campRes = await pool.query(
    `SELECT c.campaign_id, c.name, c.status, c.objective, ${TOTALS_SELECT_I}
     FROM ${s.campaignsTable} c
     JOIN ${s.accountsTable} a ON a.id = c.ad_account_id
     LEFT JOIN ${s.insightsTable} i ON i.ad_account_id = a.id
       AND i.entity_type = 'campaign'
       AND i.entity_external_id = c.campaign_id
       AND i.metric_date >= $3::date AND i.metric_date <= $4::date
     WHERE a.connection_id = $1 AND c.campaign_id = $2
     GROUP BY c.campaign_id, c.name, c.status, c.objective`,
    [connId, campaignId, window.since, window.until]
  );

  if (!campRes.rows.length) {
    const fallback = await pool.query(
      `SELECT i.entity_external_id AS campaign_id,
        COALESCE(MAX(c.name), i.entity_external_id) AS name,
        MAX(c.status) AS status,
        MAX(c.objective) AS objective,
        ${TOTALS_SELECT_I}
       FROM ${s.insightsTable} i
       JOIN ${s.accountsTable} a ON a.id = i.ad_account_id
       LEFT JOIN ${s.campaignsTable} c ON c.ad_account_id = a.id AND c.campaign_id = i.entity_external_id
       WHERE a.connection_id = $1 AND i.entity_type = 'campaign'
         AND i.entity_external_id = $2
         AND i.metric_date >= $3::date AND i.metric_date <= $4::date
       GROUP BY i.entity_external_id`,
      [connId, campaignId, window.since, window.until]
    );
    if (!fallback.rows.length) return null;
    campRes.rows = fallback.rows;
  }

  const camp = campRes.rows[0];
  const trends = await getCampaignTrends(userId, campaignId, window, platform, platform);

  const adsetRes = await pool.query(
    `SELECT s.${adsetCol} AS adset_id, s.name, s.status, ${TOTALS_SELECT_I}
     FROM ${adsetTable} s
     JOIN ${s.accountsTable} a ON a.id = s.ad_account_id
     LEFT JOIN ${s.insightsTable} i ON i.ad_account_id = a.id
       AND i.entity_type = 'adset'
       AND i.entity_external_id = s.${adsetCol}
       AND i.metric_date >= $3::date AND i.metric_date <= $4::date
     WHERE a.connection_id = $1 AND s.campaign_id = $2
     GROUP BY s.${adsetCol}, s.name, s.status
     ORDER BY spend DESC NULLS LAST`,
    [connId, campaignId, window.since, window.until]
  );

  const adsetIds = adsetRes.rows.map((r) => r.adset_id);
  let adsByAdset: Record<string, CampaignDrillDown['adsets'][0]['ads']> = {};

  if (adsetIds.length) {
    const adsRes = await pool.query(
      `SELECT ad.${adsetCol} AS adset_id, ad.ad_id, ad.name, ad.status,
        ad.creative_name, ad.creative_thumbnail_url,
        ${TOTALS_SELECT_I}
       FROM ${s.adsTable} ad
       JOIN ${s.accountsTable} a ON a.id = ad.ad_account_id
       LEFT JOIN ${s.insightsTable} i ON i.ad_account_id = a.id
         AND i.entity_type = 'ad'
         AND i.entity_external_id = ad.ad_id
         AND i.metric_date >= $3::date AND i.metric_date <= $4::date
       WHERE a.connection_id = $1 AND ad.campaign_id = $2
       GROUP BY ad.${adsetCol}, ad.ad_id, ad.name, ad.status,
         ad.creative_name, ad.creative_thumbnail_url
       ORDER BY spend DESC NULLS LAST`,
      [connId, campaignId, window.since, window.until]
    );

    for (const row of adsRes.rows) {
      const key = String(row.adset_id || '_none');
      if (!adsByAdset[key]) adsByAdset[key] = [];
      adsByAdset[key].push({
        ad_id: String(row.ad_id),
        name: String(row.name || row.ad_id),
        status: row.status ? String(row.status) : null,
        creative_name: row.creative_name ? String(row.creative_name) : null,
        creative_thumbnail_url: row.creative_thumbnail_url
          ? String(row.creative_thumbnail_url)
          : null,
        metrics: rowToTotals(row),
      });
    }
  }

  return {
    campaign: {
      campaign_id: String(camp.campaign_id),
      name: String(camp.name || camp.campaign_id),
      status: camp.status ? String(camp.status) : null,
      objective: camp.objective ? String(camp.objective) : null,
      metrics: rowToTotals(camp),
    },
    trends,
    adsets: adsetRes.rows.map((r) => ({
      adset_id: String(r.adset_id),
      name: String(r.name || r.adset_id),
      status: r.status ? String(r.status) : null,
      metrics: rowToTotals(r),
      ads: adsByAdset[String(r.adset_id)] || [],
    })),
  };
}

export async function getAccountTotals(
  userId: number,
  window: DateWindow,
  scope: AdsPlatformScope = 'meta'
): Promise<MetricTotals | null> {
  const conns = await connectionIdsForScope(userId, scope);
  if (!conns.length) return null;

  const parts = conns.map(({ platform, connectionId }) => {
    const s = PLATFORM_SCHEMAS[platform];
    return `
      SELECT ${TOTALS_SELECT_I}
      FROM ${s.insightsTable} i
      JOIN ${s.accountsTable} a ON a.id = i.ad_account_id
      WHERE a.connection_id = ${connectionId} AND a.is_selected = true
        AND i.entity_type = 'campaign'
        AND i.metric_date >= '${window.since}'::date
        AND i.metric_date <= '${window.until}'::date
    `;
  });

  const res = await pool.query(
    `SELECT ${TOTALS_SELECT_SUB} FROM (${parts.map((p) => `(${p})`).join(' UNION ALL ')}) sub`
  );

  if (!res.rows[0]) return null;
  return rowToTotals(res.rows[0]);
}

export async function getAccountTotalsForRange(
  userId: number,
  window: DateWindow,
  scope: AdsPlatformScope = 'meta'
): Promise<MetricTotals | null> {
  return getAccountTotals(userId, window, scope);
}

/** TikTok-native video metrics aggregated at account level. */
export async function getTikTokVideoMetrics(userId: number, window: DateWindow) {
  const connId = await connectionIdForPlatform(userId, 'tiktok');
  if (!connId) return null;

  const res = await pool.query(
    `SELECT
      COALESCE(AVG(NULLIF(i.hook_rate, 0)), 0)::float AS hook_rate,
      COALESCE(AVG(NULLIF(i.thumbstop_ratio, 0)), 0)::float AS thumbstop_ratio,
      COALESCE(AVG(NULLIF(i.hold_rate, 0)), 0)::float AS hold_rate,
      COALESCE(SUM(i.video_views), 0)::bigint AS video_views,
      COALESCE(SUM(i.video_watched_2s), 0)::bigint AS video_watched_2s,
      COALESCE(SUM(i.video_watched_6s), 0)::bigint AS video_watched_6s
     FROM tiktok_insights_daily i
     JOIN tiktok_ad_accounts a ON a.id = i.ad_account_id
     WHERE a.connection_id = $1 AND a.is_selected = true
       AND i.entity_type = 'ad'
       AND i.metric_date >= $2::date AND i.metric_date <= $3::date`,
    [connId, window.since, window.until]
  );
  return res.rows[0] || null;
}
