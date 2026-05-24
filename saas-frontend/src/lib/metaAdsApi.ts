import { apiFetch } from './api';
import { apiFetchWithTimeout, type ApiFetchOptions } from './fetchWithTimeout';

export type MetaAdAccount = {
  id: number;
  ad_account_id: string;
  name: string;
  advertiser_name?: string;
  currency: string;
  account_status: string | null;
  status?: string | null;
  timezone?: string | null;
  is_selected: boolean;
};

export type MetaStatus = {
  connected: boolean;
  metaUserId?: string;
  authType?: string;
  status?: string;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  advertiserCount?: number;
  selectedAdvertiserCount?: number;
  needsAdvertiserSelection?: boolean;
  accounts?: MetaAdAccount[];
};

export type MetaDashboard = {
  connected: boolean;
  connection?: {
    status: string;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
  accounts?: MetaAdAccount[];
  summary?: {
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
    purchases: number;
    purchase_value: number;
    roas: number;
  };
  topCampaigns?: {
    campaign_id: string;
    name: string;
    spend: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    purchases: number;
    roas: number;
  }[];
  window?: {
    since: string;
    until: string;
    preset: DatePreset;
    days: number;
  };
};

export type TrendPoint = {
  date: string;
  spend: number;
  roas: number;
  ctr: number;
  purchases: number;
  cpm: number;
};

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_3d'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'custom';

export type DateWindow = {
  preset: DatePreset;
  since?: string;
  until?: string;
};

export type PerformanceInsight = {
  id: string;
  severity: 'critical' | 'warning' | 'opportunity' | 'scaling_winner';
  category: string;
  title: string;
  message: string;
  suggestedAction: 'KEEP_SCALING' | 'TEST_MORE' | 'WATCH' | 'PAUSE' | 'KILL';
  reason: string;
  confidenceScore: number;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  metrics?: Record<string, number>;
};

export type AdsIntelligence = {
  health: {
    grade: string;
    headline: string;
    summary: string;
    spend: number;
    roas: number;
    purchases: number;
    ctr: number;
    cpm: number;
  };
  insights: PerformanceInsight[];
  aiSummary?: string;
  recommendations: string[];
  generatedAt: string;
  fromCache?: boolean;
  window?: {
    since: string;
    until: string;
    preset: DatePreset;
    days: number;
  };
};

export type AdsAlert = {
  id: number;
  platform: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_external_id: string | null;
  status: string;
  created_at: string;
};

export type MetricTotals = {
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
};

export type CampaignDrillDown = {
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
};

export type AdsPlatform = 'meta' | 'tiktok' | 'combined';

function buildWindowQuery(window?: DateWindow, platform?: AdsPlatform): string {
  const parts: string[] = [];
  if (!window) parts.push('preset=last_30d');
  else if (window.preset === 'custom' && window.since && window.until) {
    parts.push(`preset=custom&since=${encodeURIComponent(window.since)}&until=${encodeURIComponent(window.until)}`);
  } else {
    parts.push(`preset=${encodeURIComponent(window.preset)}`);
  }
  if (platform && platform !== 'meta') parts.push(`platform=${platform}`);
  return parts.join('&');
}

function platformPrefix(platform: AdsPlatform): string {
  if (platform === 'tiktok') return '/api/tiktok';
  if (platform === 'combined') return '/api/ads';
  return '/api/meta';
}

export const metaAdsApi = {
  hubStatus: () =>
    apiFetch<{ success: boolean; data: { meta: { connected: boolean }; tiktok: { connected: boolean } } }>(
      '/api/ads/status'
    ),

  oauthStart: (platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: { url: string } }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/oauth/start`
    ),

  status: (platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: MetaStatus }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/status`
    ),

  sync: (days = 14, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: { accountsSynced: number; insightRows: number } }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/sync`,
      { method: 'POST', body: JSON.stringify({ days }) }
    ),

  dashboard: (window?: DateWindow, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: MetaDashboard }>(
      `${platformPrefix(platform)}/dashboard?${buildWindowQuery(window, platform)}`
    ),

  trends: (window?: DateWindow, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: { trends: TrendPoint[]; window: { since: string; until: string; preset: DatePreset; days: number } } }>(
      `${platformPrefix(platform)}/trends?${buildWindowQuery(window, platform)}`
    ),

  insights: (window?: DateWindow, refresh = false, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: AdsIntelligence }>(
      `${platformPrefix(platform)}/insights?${buildWindowQuery(window, platform)}${refresh ? '&refresh=1' : ''}`
    ),

  alerts: (status: 'open' | 'resolved' | 'all' = 'open', window?: DateWindow, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: { alerts: AdsAlert[] } }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/alerts?status=${status}&${buildWindowQuery(window)}`
    ),

  resolveAlert: (id: number, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/alerts/${id}`,
      { method: 'PATCH' }
    ),

  campaign: (
    campaignId: string,
    window?: DateWindow,
    platform: AdsPlatform = 'meta',
    options?: ApiFetchOptions
  ) => {
    const base = platform === 'tiktok' ? '/api/tiktok' : '/api/meta';
    const q = buildWindowQuery(window);
    const platformQ = platform && platform !== 'meta' ? `&platform=${platform}` : '';
    return apiFetchWithTimeout<{ success: boolean; data: CampaignDrillDown & { platform?: string } }>(
      `${base}/campaigns/${encodeURIComponent(campaignId)}?${q}${platformQ}`,
      { timeoutMs: 15000, ...options }
    );
  },

  campaignProductContext: (platform: 'meta' | 'tiktok', campaignId: string, options?: ApiFetchOptions) =>
    apiFetchWithTimeout<{ success: boolean; data: { match: Record<string, unknown> | null } }>(
      `/api/context/campaigns/${platform}/${encodeURIComponent(campaignId)}/product`,
      { timeoutMs: 8000, ...options }
    ),

  setAccountSelected: (id: number, isSelected: boolean, platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: { accounts: MetaAdAccount[] } }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/ad-accounts/${id}`,
      { method: 'PATCH', body: JSON.stringify({ isSelected }) }
    ),

  disconnect: (platform: AdsPlatform = 'meta') =>
    apiFetch<{ success: boolean; data: { connected: boolean } }>(
      `${platform === 'tiktok' ? '/api/tiktok' : '/api/meta'}/connection`,
      { method: 'DELETE' }
    ),

  refreshTikTokAdvertisers: () =>
    apiFetch<{ success: boolean; data: { advertisers: MetaAdAccount[]; count: number } }>(
      '/api/tiktok/advertisers/refresh',
      { method: 'POST' }
    ),
};
