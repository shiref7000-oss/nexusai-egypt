import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { withGraphRateControl } from './requestControl';

export const META_GRAPH_VERSION = env.META_GRAPH_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type MetaGraphError = { message: string; code?: number; type?: string };

async function graphGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH}${path.startsWith('/') ? path : `/${path}`}`);
  url.searchParams.set('access_token', accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const data = await withGraphRateControl(accessToken, path, async () => {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60000) });
    const body = (await res.json()) as T & { error?: MetaGraphError };
    if (!res.ok || body.error) {
      logger.warn('Meta Graph API error', { path, status: res.status, error: body.error });
    }
    return { ok: res.ok && !body.error, status: res.status, data: body };
  });

  if (data.error) {
    const msg = data.error?.message || `Meta API HTTP error`;
    logger.warn('Meta Graph API error', { path, error: data.error });
    throw new Error(msg);
  }

  return data;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: MetaGraphError;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message || 'Failed to exchange OAuth code');
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export async function exchangeLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  expires_in?: number;
}> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: MetaGraphError;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message || 'Failed to get long-lived token');
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export async function getMetaUser(accessToken: string): Promise<{ id: string; name?: string }> {
  return graphGet('/me', accessToken, { fields: 'id,name' });
}

export type MetaAdAccountRow = {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
};

type Paged<T> = { data?: T[]; paging?: { next?: string }; error?: MetaGraphError };

async function fetchPagedUrl<T>(url: string): Promise<Paged<T>> {
  const tokenMatch = /[?&]access_token=([^&]+)/.exec(url);
  const accessToken = tokenMatch?.[1] ? decodeURIComponent(tokenMatch[1]) : '';
  const data = await withGraphRateControl(accessToken, 'paged_url', async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const body = (await res.json()) as Paged<T>;
    return { ok: res.ok && !body.error, status: res.status, data: body };
  });
  if (data.error) throw new Error(data.error?.message || `Meta API paged error`);
  return data;
}

async function fetchAllPages<T>(
  accessToken: string,
  initialPath: string,
  params: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    const data = first
      ? await graphGet<Paged<T>>(initialPath, accessToken, params)
      : await fetchPagedUrl<T>(nextUrl!);
    first = false;
    if (data.data?.length) all.push(...data.data);
    nextUrl = data.paging?.next || null;
  }

  return all;
}

export async function listAdAccounts(accessToken: string): Promise<MetaAdAccountRow[]> {
  return fetchAllPages<MetaAdAccountRow>(accessToken, '/me/adaccounts', {
    fields: 'id,name,account_status,currency',
    limit: '100',
  });
}

export async function listCampaigns(accessToken: string, actId: string) {
  const accountId = actId.startsWith('act_') ? actId : `act_${actId}`;
  return fetchAllPages<{ id: string; name?: string; status?: string; objective?: string }>(
    accessToken,
    `/${accountId}/campaigns`,
    {
      fields: 'id,name,status,objective,effective_status',
      effective_status: JSON.stringify([
        'ACTIVE',
        'PAUSED',
        'ARCHIVED',
        'ADSET_PAUSED',
        'CAMPAIGN_PAUSED',
        'WITH_ISSUES',
        'IN_PROCESS',
      ]),
      limit: '200',
    }
  );
}

export async function listAdSets(accessToken: string, actId: string) {
  const accountId = actId.startsWith('act_') ? actId : `act_${actId}`;
  return fetchAllPages<{ id: string; name?: string; status?: string; campaign_id?: string }>(
    accessToken,
    `/${accountId}/adsets`,
    {
      fields: 'id,name,status,effective_status,campaign_id',
      effective_status: JSON.stringify([
        'ACTIVE',
        'PAUSED',
        'ARCHIVED',
        'CAMPAIGN_PAUSED',
        'WITH_ISSUES',
        'IN_PROCESS',
      ]),
      limit: '200',
    }
  );
}

export async function listAds(accessToken: string, actId: string) {
  const accountId = actId.startsWith('act_') ? actId : `act_${actId}`;
  return fetchAllPages<{
    id: string;
    name?: string;
    status?: string;
    adset_id?: string;
    campaign_id?: string;
    creative?: { id?: string; name?: string; thumbnail_url?: string };
  }>(accessToken, `/${accountId}/ads`, {
    fields:
      'id,name,status,effective_status,adset_id,campaign_id,creative{id,name,thumbnail_url}',
    effective_status: JSON.stringify([
      'ACTIVE',
      'PAUSED',
      'ARCHIVED',
      'ADSET_PAUSED',
      'CAMPAIGN_PAUSED',
      'WITH_ISSUES',
      'IN_PROCESS',
    ]),
    limit: '200',
  });
}

export type InsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  purchase_roas?: { action_type: string; value: string }[];
  website_purchase_roas?: { action_type: string; value: string }[];
  frequency?: string;
  reach?: string;
};

export async function fetchDailyInsights(
  accessToken: string,
  actId: string,
  level: 'campaign' | 'adset' | 'ad',
  since: string,
  until: string
): Promise<InsightRow[]> {
  const accountId = actId.startsWith('act_') ? actId : `act_${actId}`;
  const idFields =
    level === 'campaign'
      ? 'campaign_id,campaign_name'
      : level === 'adset'
        ? 'adset_id,adset_name,campaign_id'
        : 'ad_id,ad_name,adset_id,campaign_id';

  return fetchAllPages<InsightRow>(accessToken, `/${accountId}/insights`, {
    level,
    fields: `${idFields},spend,impressions,clicks,ctr,cpc,cpm,frequency,reach,actions,action_values,purchase_roas,website_purchase_roas`,
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    limit: '500',
    action_attribution_windows: JSON.stringify(['7d_click', '1d_view']),
  });
}
