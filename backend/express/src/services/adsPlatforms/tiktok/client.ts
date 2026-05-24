import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { withAdsApiRateControl } from '../shared/requestControl';
import { tiktokAttributionSpec } from '../attribution';

const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3';

/** Marketing API authorization — NOT Login Kit / creator OAuth. */
export const TIKTOK_MARKETING_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';

type TikTokApiResponse<T> = {
  code?: number;
  message?: string;
  data?: T;
  request_id?: string;
};

type PageInfo = { page?: number; page_size?: number; total_number?: number; total_page?: number };

export type TikTokAdvertiserAccount = {
  advertiser_id: string;
  advertiser_name?: string;
  status?: string;
  currency?: string;
  timezone?: string;
};

async function tiktokRequest<T>(
  accessToken: string,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string> = {},
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(`${TIKTOK_API}${path.startsWith('/') ? path : `/${path}`}`);
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    'Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  const envelope = await withAdsApiRateControl(accessToken, 'tiktok', path, async () => {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: method === 'POST' && body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const json = (await res.json()) as TikTokApiResponse<T>;
    const ok = res.ok && json.code === 0;
    if (!ok) {
      logger.warn('TikTok API error', { path, code: json.code, message: json.message });
    }
    return { ok, status: res.status, data: json };
  });

  if (envelope.code !== 0) {
    throw new Error(envelope.message || `TikTok API error on ${path}`);
  }
  return envelope.data as T;
}

/**
 * Marketing API OAuth — authorizes access to TikTok Ads Manager advertiser accounts.
 * Requires TikTok for Business app with Marketing API enabled (not Login Kit only).
 */
export function getMarketingOAuthUrl(state: string, redirectUri: string): string {
  const url = new URL(TIKTOK_MARKETING_AUTH_URL);
  url.searchParams.set('app_id', env.TIKTOK_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

/** @deprecated use getMarketingOAuthUrl */
export const tiktokOAuthUrl = getMarketingOAuthUrl;

async function oauthPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${TIKTOK_API}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const json = (await res.json()) as TikTokApiResponse<T>;
  if (!res.ok || json.code !== 0) {
    const msg = json.message || `TikTok OAuth failed (${path})`;
    if (/creator|scope|permission/i.test(msg)) {
      throw new Error(
        `${msg} — connect via TikTok Marketing API (business-api.tiktok.com), not creator Login Kit scopes.`
      );
    }
    throw new Error(msg);
  }
  return json.data as T;
}

export async function exchangeAuthCode(authCode: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  advertiser_ids?: string[];
}> {
  return oauthPost('/oauth2/access_token/', {
    app_id: env.TIKTOK_APP_ID,
    secret: env.TIKTOK_APP_SECRET,
    auth_code: authCode,
    grant_type: 'authorization_code',
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  return oauthPost('/oauth2/refresh_token/', {
    app_id: env.TIKTOK_APP_ID,
    secret: env.TIKTOK_APP_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

function parseAdvertiserRow(raw: Record<string, unknown>): TikTokAdvertiserAccount | null {
  const id = raw.advertiser_id ?? raw.advertiserId ?? raw.id;
  if (id == null || id === '') return null;
  return {
    advertiser_id: String(id),
    advertiser_name: raw.advertiser_name
      ? String(raw.advertiser_name)
      : raw.name
        ? String(raw.name)
        : undefined,
    currency: raw.currency ? String(raw.currency) : undefined,
    status:
      raw.status != null
        ? String(raw.status)
        : raw.advertiser_status != null
          ? String(raw.advertiser_status)
          : undefined,
    timezone: raw.timezone ? String(raw.timezone) : raw.display_timezone ? String(raw.display_timezone) : undefined,
  };
}

/**
 * GET /open_api/v1.3/oauth2/advertiser/get/
 * Headers: Access-Token. Query: app_id, secret (Marketing API requirement).
 */
export async function listAuthorizedAdvertisers(accessToken: string): Promise<TikTokAdvertiserAccount[]> {
  const data = await tiktokRequest<{ list?: Record<string, unknown>[] } | Record<string, unknown>[]>(
    accessToken,
    'GET',
    '/oauth2/advertiser/get/',
    {
      app_id: env.TIKTOK_APP_ID,
      secret: env.TIKTOK_APP_SECRET,
    }
  );

  const rawList = Array.isArray(data)
    ? data
    : Array.isArray((data as { list?: unknown }).list)
      ? ((data as { list: Record<string, unknown>[] }).list ?? [])
      : [];

  return rawList.map(parseAdvertiserRow).filter((r): r is TikTokAdvertiserAccount => r != null);
}

/** @deprecated use listAuthorizedAdvertisers */
export const listAdvertisers = listAuthorizedAdvertisers;

const ADVERTISER_INFO_FIELDS = JSON.stringify([
  'advertiser_id',
  'name',
  'currency',
  'timezone',
  'status',
  'display_timezone',
]);

/**
 * GET /open_api/v1.3/advertiser/info/ — enrich advertiser_id, name, currency, timezone, status.
 */
export async function fetchAdvertiserInfo(
  accessToken: string,
  advertiserIds: string[]
): Promise<TikTokAdvertiserAccount[]> {
  if (!advertiserIds.length) return [];

  const out: TikTokAdvertiserAccount[] = [];
  const chunkSize = 50;

  for (let i = 0; i < advertiserIds.length; i += chunkSize) {
    const chunk = advertiserIds.slice(i, i + chunkSize);
    const data = await tiktokRequest<{ list?: Record<string, unknown>[] }>(
      accessToken,
      'GET',
      '/advertiser/info/',
      {
        advertiser_ids: JSON.stringify(chunk),
        fields: ADVERTISER_INFO_FIELDS,
      }
    );

    for (const row of data.list || []) {
      const parsed = parseAdvertiserRow({
        ...row,
        advertiser_id: row.advertiser_id ?? row.advertiserId,
        advertiser_name: row.name ?? row.advertiser_name,
      });
      if (parsed) out.push(parsed);
    }
  }

  return out;
}

async function fetchPagedList<T>(
  accessToken: string,
  path: string,
  baseParams: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPage = 1;

  while (page <= totalPage) {
    const data = await tiktokRequest<{ list?: T[]; page_info?: PageInfo }>(accessToken, 'GET', path, {
      ...baseParams,
      page: String(page),
      page_size: String(pageSize),
    });
    if (data.list?.length) all.push(...data.list);
    totalPage = data.page_info?.total_page || 1;
    page++;
  }
  return all;
}

export async function listCampaigns(accessToken: string, advertiserId: string) {
  return fetchPagedList<{
    campaign_id: string;
    campaign_name?: string;
    operation_status?: string;
    objective_type?: string;
  }>(accessToken, '/campaign/get/', { advertiser_id: advertiserId });
}

export async function listAdGroups(accessToken: string, advertiserId: string) {
  return fetchPagedList<{
    adgroup_id: string;
    adgroup_name?: string;
    campaign_id?: string;
    operation_status?: string;
  }>(accessToken, '/adgroup/get/', { advertiser_id: advertiserId });
}

export async function listAds(accessToken: string, advertiserId: string) {
  return fetchPagedList<{
    ad_id: string;
    ad_name?: string;
    adgroup_id?: string;
    campaign_id?: string;
    operation_status?: string;
    creative_id?: string;
  }>(accessToken, '/ad/get/', { advertiser_id: advertiserId });
}

const REPORT_METRICS = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'complete_payment',
  'total_complete_payment_amount',
  'video_play_actions',
  'video_watched_2s',
  'video_watched_6s',
  'reach',
  'frequency',
].join(',');

function dataLevelForEntity(level: 'campaign' | 'adset' | 'ad'): string {
  if (level === 'campaign') return 'AUCTION_CAMPAIGN';
  if (level === 'adset') return 'AUCTION_ADGROUP';
  return 'AUCTION_AD';
}

function dimensionsForEntity(level: 'campaign' | 'adset' | 'ad'): string {
  if (level === 'campaign') return 'campaign_id';
  if (level === 'adset') return 'adgroup_id';
  return 'ad_id';
}

export type TikTokInsightRow = Record<string, string | number | undefined> & {
  stat_time_day?: string;
  campaign_id?: string;
  adgroup_id?: string;
  ad_id?: string;
};

export async function fetchDailyInsights(
  accessToken: string,
  advertiserId: string,
  level: 'campaign' | 'adset' | 'ad',
  since: string,
  until: string
): Promise<TikTokInsightRow[]> {
  void tiktokAttributionSpec();
  const all: TikTokInsightRow[] = [];
  let page = 1;
  let totalPage = 1;

  while (page <= totalPage) {
    const data = await tiktokRequest<{ list?: TikTokInsightRow[]; page_info?: PageInfo }>(
      accessToken,
      'GET',
      '/report/integrated/get/',
      {
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: dataLevelForEntity(level),
        dimensions: JSON.stringify(['stat_time_day', dimensionsForEntity(level)]),
        metrics: REPORT_METRICS,
        start_date: since,
        end_date: until,
        page: String(page),
        page_size: '500',
      }
    );
    if (data.list?.length) all.push(...data.list);
    totalPage = data.page_info?.total_page || 1;
    page++;
  }

  return all;
}
