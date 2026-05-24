import type { PerformanceInsight } from '../adsPlatforms/types';
import { pool } from '../../config/db_pg';
import { connectionIdForPlatform } from '../adsPlatforms/platformSchema';
import type { DateWindow } from './dateWindow';

const MIN_IMPRESSIONS = 1000;
const MIN_SPEND = 30;

/** TikTok-native creative intelligence: hook rate, thumbstop, hold rate, video fatigue. */
export async function buildTikTokVideoInsights(
  userId: number,
  window: DateWindow
): Promise<PerformanceInsight[]> {
  const connId = await connectionIdForPlatform(userId, 'tiktok');
  if (!connId) return [];

  const res = await pool.query(
    `SELECT ad.ad_id, ad.name AS ad_name, ad.campaign_id,
      COALESCE(c.name, ad.campaign_id) AS campaign_name,
      SUM(i.spend)::float AS spend,
      SUM(i.impressions)::bigint AS impressions,
      AVG(NULLIF(i.ctr, 0))::float AS ctr,
      AVG(NULLIF(i.hook_rate, 0))::float AS hook_rate,
      AVG(NULLIF(i.thumbstop_ratio, 0))::float AS thumbstop_ratio,
      AVG(NULLIF(i.hold_rate, 0))::float AS hold_rate,
      AVG(NULLIF(i.frequency, 0))::float AS frequency
     FROM tiktok_ads ad
     JOIN tiktok_ad_accounts a ON a.id = ad.ad_account_id
     LEFT JOIN tiktok_campaigns c ON c.ad_account_id = a.id AND c.campaign_id = ad.campaign_id
     JOIN tiktok_insights_daily i ON i.ad_account_id = a.id
       AND i.entity_type = 'ad' AND i.entity_external_id = ad.ad_id
       AND i.metric_date >= $2::date AND i.metric_date <= $3::date
     WHERE a.connection_id = $1 AND a.is_selected = true
     GROUP BY ad.ad_id, ad.name, ad.campaign_id, c.name
     HAVING SUM(i.impressions) >= $4 AND SUM(i.spend) >= $5`,
    [connId, window.since, window.until, MIN_IMPRESSIONS, MIN_SPEND]
  );

  const rows = res.rows;
  if (!rows.length) return [];

  const hookRates = rows.map((r) => Number(r.hook_rate) || 0).filter((v) => v > 0);
  const thumbstops = rows.map((r) => Number(r.thumbstop_ratio) || 0).filter((v) => v > 0);
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  const medianHook = median(hookRates);
  const medianThumb = median(thumbstops);

  const insights: PerformanceInsight[] = [];
  let seq = 0;

  for (const r of rows) {
    const hook = Number(r.hook_rate) || 0;
    const thumb = Number(r.thumbstop_ratio) || 0;
    const hold = Number(r.hold_rate) || 0;
    const freq = Number(r.frequency) || 0;
    const ctr = Number(r.ctr) || 0;
    const spend = Number(r.spend) || 0;
    const name = String(r.ad_name || r.ad_id);

    if (medianHook > 0 && hook > 0 && hook >= medianHook * 1.35) {
      insights.push({
        id: `tt-hook-${++seq}`,
        severity: 'opportunity',
        category: 'strong_hook',
        title: `Strong hook: ${name}`,
        message: `Hook rate ${hook.toFixed(2)}% beats account median. Consider scaling this creative.`,
        suggestedAction: 'KEEP_SCALING',
        reason: `Hook rate is ${((hook / medianHook - 1) * 100).toFixed(0)}% above median.`,
        confidenceScore: Math.min(0.9, spend / 2000),
        entityType: 'ad',
        entityId: String(r.ad_id),
        entityName: name,
        metrics: { hook_rate: hook, thumbstop_ratio: thumb, hold_rate: hold },
      });
    }

    if (medianHook > 0 && hook > 0 && hook < medianHook * 0.55) {
      insights.push({
        id: `tt-weak-hook-${++seq}`,
        severity: 'warning',
        category: 'weak_hook',
        title: `Weak hook: ${name}`,
        message: `Hook rate ${hook.toFixed(2)}% is below median. Test a stronger opening frame.`,
        suggestedAction: 'TEST_MORE',
        reason: 'First 2s retention underperforms account baseline.',
        confidenceScore: Math.min(0.85, spend / 1500),
        entityType: 'ad',
        entityId: String(r.ad_id),
        entityName: name,
        metrics: { hook_rate: hook, ctr },
      });
    }

    if (medianThumb > 0 && thumb > 0 && thumb < medianThumb * 0.5) {
      insights.push({
        id: `tt-thumb-${++seq}`,
        severity: 'warning',
        category: 'low_thumbstop',
        title: `Low thumbstop: ${name}`,
        message: `Thumbstop ${thumb.toFixed(2)}% suggests weak scroll-stopping power.`,
        suggestedAction: 'TEST_MORE',
        reason: 'Video play rate vs impressions is weak.',
        confidenceScore: 0.7,
        entityType: 'ad',
        entityId: String(r.ad_id),
        entityName: name,
        metrics: { thumbstop_ratio: thumb },
      });
    }

    if (hold > 0 && hold < 15 && spend >= 100) {
      insights.push({
        id: `tt-hold-${++seq}`,
        severity: 'warning',
        category: 'low_hold',
        title: `Low hold rate: ${name}`,
        message: `Hold rate ${hold.toFixed(1)}% — viewers drop after initial play.`,
        suggestedAction: 'WATCH',
        reason: '6s watch / plays ratio is weak; mid-video may need work.',
        confidenceScore: 0.65,
        entityType: 'ad',
        entityId: String(r.ad_id),
        entityName: name,
        metrics: { hold_rate: hold },
      });
    }

    if (freq >= 2.8 && spend >= 80) {
      insights.push({
        id: `tt-fatigue-${++seq}`,
        severity: 'critical',
        category: 'video_fatigue',
        title: `Video fatigue: ${name}`,
        message: `Frequency ${freq.toFixed(2)} with sustained spend — audience may be saturated.`,
        suggestedAction: 'PAUSE',
        reason: 'High frequency on TikTok video ad often signals creative fatigue.',
        confidenceScore: Math.min(0.95, freq / 4),
        entityType: 'ad',
        entityId: String(r.ad_id),
        entityName: name,
        metrics: { frequency: freq, spend },
      });
    }
  }

  return insights.slice(0, 12);
}
