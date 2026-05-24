import { logger } from '../../../config/logger';
import {
  exchangeAuthCode,
  fetchAdvertiserInfo,
  getMarketingOAuthUrl,
  listAuthorizedAdvertisers,
  type TikTokAdvertiserAccount,
} from './client';

export type AdvertiserDiscoveryResult = {
  advertisers: TikTokAdvertiserAccount[];
  token: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    advertiser_ids?: string[];
  };
  source: 'oauth2_advertiser_get' | 'access_token_ids' | 'merged';
};

/**
 * Full Marketing API connect flow: auth_code -> access_token -> advertiser/get -> advertiser/info.
 */
export async function discoverMarketingAdvertisersFromAuthCode(
  authCode: string
): Promise<AdvertiserDiscoveryResult> {
  const token = await exchangeAuthCode(authCode);
  const { advertisers, source } = await discoverMarketingAdvertisersWithMeta(
    token.access_token,
    token.advertiser_ids
  );
  return { advertisers, token, source };
}

export async function discoverMarketingAdvertisers(
  accessToken: string,
  oauthAdvertiserIds?: string[]
): Promise<TikTokAdvertiserAccount[]> {
  const { advertisers } = await discoverMarketingAdvertisersWithMeta(accessToken, oauthAdvertiserIds);
  return advertisers;
}

async function discoverMarketingAdvertisersWithMeta(
  accessToken: string,
  oauthAdvertiserIds?: string[]
): Promise<{ advertisers: TikTokAdvertiserAccount[]; source: AdvertiserDiscoveryResult['source'] }> {
  let fromApi: TikTokAdvertiserAccount[] = [];
  let apiError: string | undefined;
  try {
    fromApi = await listAuthorizedAdvertisers(accessToken);
  } catch (e) {
    apiError = e instanceof Error ? e.message : String(e);
    logger.warn('TikTok oauth2/advertiser/get failed', { error: apiError });
  }

  const idSet = new Set<string>();
  for (const a of fromApi) {
    if (a.advertiser_id) idSet.add(a.advertiser_id);
  }
  for (const id of oauthAdvertiserIds || []) {
    if (id) idSet.add(String(id));
  }

  if (!idSet.size) {
    logger.warn('TikTok Marketing API returned zero advertiser accounts', {
      oauthIds: oauthAdvertiserIds?.length || 0,
      apiList: fromApi.length,
      apiError,
      hint: 'Use Marketing API auth at business-api.tiktok.com/portal/auth with Ads Manager access',
    });
    return { advertisers: [], source: 'access_token_ids' };
  }

  const ids = [...idSet];
  const enriched = await fetchAdvertiserInfo(accessToken, ids);
  const byId = new Map(enriched.map((a) => [a.advertiser_id, a]));

  const advertisers = ids.map((id) => {
    const hit = byId.get(id);
    const stub = fromApi.find((x) => x.advertiser_id === id);
    return {
      advertiser_id: id,
      advertiser_name: hit?.advertiser_name || stub?.advertiser_name,
      status: hit?.status || stub?.status,
      currency: hit?.currency || stub?.currency,
      timezone: hit?.timezone || stub?.timezone,
    };
  });

  const source: AdvertiserDiscoveryResult['source'] =
    fromApi.length && (oauthAdvertiserIds?.length || 0) > 0
      ? 'merged'
      : fromApi.length
        ? 'oauth2_advertiser_get'
        : 'access_token_ids';

  return { advertisers, source };
}

export { getMarketingOAuthUrl };
