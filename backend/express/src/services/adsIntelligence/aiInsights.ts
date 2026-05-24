import { pool } from '../../config/db_pg';
import { logger } from '../../config/logger';
import { processAIRequest } from '../ai';
import type { AccountHealthSummary, PerformanceInsight } from '../adsPlatforms/types';
import type { AdsPlatformId, AdsPlatformScope } from '../adsPlatforms/types';
import {
  getAccountTotals,
  getAccountTotalsForRange,
  getCampaignPerformance,
} from './metricsRepository';
import { buildRuleBasedInsights, insightsToAlertCandidates } from './ruleEngine';
import { buildTikTokVideoInsights } from './tiktokVideoRules';
import { persistAlerts } from './alerts';
import type { DateWindow } from './dateWindow';
import { previousWindow } from './dateWindow';

const CACHE_TTL_MS = 15 * 60 * 1000;

export interface AdsIntelligenceBundle {
  health: AccountHealthSummary;
  insights: PerformanceInsight[];
  aiSummary?: string;
  recommendations: string[];
  generatedAt: string;
  fromCache?: boolean;
}

async function getCached(
  userId: number,
  platform: AdsPlatformId,
  cacheKey: number
): Promise<AdsIntelligenceBundle | null> {
  const res = await pool.query(
    `SELECT payload, created_at FROM ads_ai_insights_cache
     WHERE user_id = $1 AND platform = $2 AND period_days = $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, platform, cacheKey]
  );
  if (!res.rows[0]) return null;
  const created = new Date(res.rows[0].created_at).getTime();
  if (Date.now() - created > CACHE_TTL_MS) return null;
  const payload = res.rows[0].payload as AdsIntelligenceBundle;
  return { ...payload, fromCache: true };
}

async function setCache(
  userId: number,
  platform: AdsPlatformId,
  cacheKey: number,
  bundle: AdsIntelligenceBundle
): Promise<void> {
  await pool.query(
    `INSERT INTO ads_ai_insights_cache (user_id, platform, period_days, payload)
     VALUES ($1, $2, $3, $4)`,
    [userId, platform, cacheKey, JSON.stringify(bundle)]
  );
}

export async function generateAdsIntelligence(
  userId: number,
  window: DateWindow,
  options: { refresh?: boolean; includeAi?: boolean; platform?: AdsPlatformScope } = {}
): Promise<AdsIntelligenceBundle> {
  const scope: AdsPlatformScope = options.platform || 'meta';
  const cachePlatform: AdsPlatformId = scope === 'combined' ? 'meta' : scope;
  const days = window.days;
  const cacheKey = window.preset === 'custom' ? -1 : days;
  const cacheSuffix = scope === 'combined' ? 1000 + days : days;

  if (!options.refresh && cacheKey > 0 && scope !== 'combined') {
    const cached = await getCached(userId, cachePlatform, cacheSuffix);
    if (cached) return cached;
  }

  const [account, campaigns, priorAccount, tiktokVideo] = await Promise.all([
    getAccountTotals(userId, window, scope),
    getCampaignPerformance(userId, window, scope),
    getAccountTotalsForRange(userId, previousWindow(window), scope),
    scope === 'tiktok' || scope === 'combined'
      ? buildTikTokVideoInsights(userId, window)
      : Promise.resolve([]),
  ]);

  const platformLabel =
    scope === 'combined' ? 'Meta + TikTok' : scope === 'tiktok' ? 'TikTok' : 'Meta';

  if (!account) {
    return {
      health: {
        grade: 'F',
        headline: 'No data synced',
        summary: `Connect ${platformLabel} and run a sync to generate insights.`,
        spend: 0,
        roas: 0,
        purchases: 0,
        ctr: 0,
        cpm: 0,
      },
      insights: [],
      recommendations: [`Connect ${platformLabel} Ads and sync campaign data.`],
      generatedAt: new Date().toISOString(),
    };
  }

  const { insights: baseInsights, health } = buildRuleBasedInsights(account, campaigns, priorAccount);
  const insights = [...baseInsights, ...tiktokVideo].slice(0, 24);

  const recommendations = insights
    .filter((i) => i.suggestedAction)
    .slice(0, 8)
    .map((i) => {
      return `${i.suggestedAction.replace('_', ' ')}: ${i.reason}`;
    });

  let aiSummary: string | undefined;

  if (options.includeAi !== false && insights.length > 0) {
    try {
      const top = campaigns.slice(0, 5).map((c) => ({
        name: c.name,
        spend: c.metrics.spend,
        roas: c.metrics.roas,
        ctr: c.metrics.ctr,
      }));

      let businessContextNotes = '';
      try {
        const { buildRetrievalContextForPrompt } = await import('../businessContext/businessMemory');
        businessContextNotes = await buildRetrievalContextForPrompt(
          userId,
          `ads performance ${platformLabel} roas ${account.roas} spend ${account.spend}`,
          2500
        );
      } catch {
        businessContextNotes = '';
      }

      const aiRes = await processAIRequest({
        agent: scope === 'tiktok' ? 'tiktok' : 'meta',
        prompt: `Summarize ${platformLabel} account health and top actions for a media buyer in 3-4 short bullets.`,
        context: {
          totalRevenue: account.purchase_value,
          totalOrders: account.purchases,
          roas: account.roas,
          cpa: account.purchases > 0 ? account.spend / account.purchases : 0,
          spend: account.spend,
          ctr: account.ctr,
          topCampaigns: top,
          ruleInsights: insights.slice(0, 6).map((i) => i.title),
          businessContextNotes,
        },
        userId,
        overrides: { plainText: true, responseVerbosity: 'concise' },
      });

      if (aiRes.success && aiRes.response) {
        aiSummary = aiRes.response.slice(0, 2000);
      }
    } catch (e) {
      logger.warn('AI insights summary failed', {
        error: e instanceof Error ? e.message : e,
      });
    }
  }

  const bundle: AdsIntelligenceBundle = {
    health,
    insights,
    aiSummary,
    recommendations,
    generatedAt: new Date().toISOString(),
  };

  if (cacheKey > 0 && scope !== 'combined') {
    await setCache(userId, cachePlatform, cacheSuffix, bundle);
  }

  const alertCandidates = insightsToAlertCandidates(baseInsights);
  if (alertCandidates.length && scope !== 'tiktok') {
    await persistAlerts(userId, 'meta', alertCandidates);
  }
  if (tiktokVideo.length) {
    await persistAlerts(userId, 'tiktok', insightsToAlertCandidates(tiktokVideo));
  } else if (alertCandidates.length && scope === 'tiktok') {
    await persistAlerts(userId, 'tiktok', alertCandidates);
  }

  return bundle;
}
