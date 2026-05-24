/** Shared ads platform types — Meta today, TikTok later. */

export type AdsPlatformId = 'meta' | 'tiktok';

/** Read scope for intelligence APIs — single platform or blended. */
export type AdsPlatformScope = AdsPlatformId | 'combined';

export type EntityLevel = 'campaign' | 'adset' | 'ad';

export interface MetricTotals {
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
}

export interface TrendPoint {
  date: string;
  spend: number;
  roas: number;
  ctr: number;
  purchases: number;
  cpm: number;
}

export type InsightSeverity = 'critical' | 'warning' | 'opportunity' | 'scaling_winner';
export type SuggestedAction = 'KEEP_SCALING' | 'TEST_MORE' | 'WATCH' | 'PAUSE' | 'KILL';

export interface PerformanceInsight {
  id: string;
  severity: InsightSeverity;
  category: string;
  title: string;
  message: string;
  suggestedAction: SuggestedAction;
  reason: string;
  confidenceScore: number; // 0..1
  entityType?: EntityLevel;
  entityId?: string;
  entityName?: string;
  metrics?: Record<string, number>;
}

export interface AccountHealthSummary {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  headline: string;
  summary: string;
  spend: number;
  roas: number;
  purchases: number;
  ctr: number;
  cpm: number;
}

export interface AdsAlertRow {
  id: number;
  platform: AdsPlatformId;
  alert_type: string;
  severity: InsightSeverity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_external_id: string | null;
  metric_snapshot: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export interface CampaignDrillDown {
  campaign: {
    campaign_id: string;
    name: string;
    status: string | null;
    objective: string | null;
    metrics: MetricTotals;
  };
  trends: TrendPoint[];
  adsets: Array<{
    adset_id: string;
    name: string;
    status: string | null;
    metrics: MetricTotals;
    ads: Array<{
      ad_id: string;
      name: string;
      status: string | null;
      creative_name: string | null;
      creative_thumbnail_url: string | null;
      metrics: MetricTotals;
    }>;
  }>;
}
