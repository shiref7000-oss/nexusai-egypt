import { DEFAULT_ATTRIBUTION } from '../attribution';

export type TikTokReportRow = Record<string, string | number | undefined>;

export function parseNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Normalize TikTok integrated report metrics to internal schema */
export function normalizeTikTokMetrics(row: TikTokReportRow): {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  frequency: number;
  reach: number;
  video_views: number;
  video_watched_2s: number;
  video_watched_6s: number;
  hook_rate: number;
  thumbstop_ratio: number;
  hold_rate: number;
  attribution_window: string;
} {
  const spend = parseNum(row.spend);
  const impressions = parseNum(row.impressions);
  const clicks = parseNum(row.clicks);
  const purchases = parseNum(row.complete_payment ?? row.purchases ?? row.conversions);
  const purchase_value = parseNum(
    row.total_complete_payment_amount ?? row.total_purchase_value ?? row.value ?? row.purchase_value
  );

  let ctr = parseNum(row.ctr);
  if (!ctr && impressions > 0) ctr = (clicks / impressions) * 100;

  let cpc = parseNum(row.cpc);
  if (!cpc && clicks > 0) cpc = spend / clicks;

  let cpm = parseNum(row.cpm);
  if (!cpm && impressions > 0) cpm = (spend / impressions) * 1000;

  let roas = parseNum(row.roas ?? row.purchase_roas);
  if (!roas && spend > 0 && purchase_value > 0) roas = purchase_value / spend;

  const video_views = parseNum(row.video_play_actions ?? row.video_views);
  const video_watched_2s = parseNum(row.video_watched_2s);
  const video_watched_6s = parseNum(row.video_watched_6s);

  const hook_rate = impressions > 0 ? (video_watched_2s / impressions) * 100 : 0;
  const thumbstop_ratio = impressions > 0 ? (video_views / impressions) * 100 : 0;
  const hold_rate = video_views > 0 ? (video_watched_6s / video_views) * 100 : 0;

  return {
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    cpm,
    purchases,
    purchase_value,
    roas,
    frequency: parseNum(row.frequency),
    reach: parseNum(row.reach),
    video_views,
    video_watched_2s,
    video_watched_6s,
    hook_rate,
    thumbstop_ratio,
    hold_rate,
    attribution_window: DEFAULT_ATTRIBUTION,
  };
}
