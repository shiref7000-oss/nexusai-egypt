import type { AdsPlatformId } from './types';
import { getConnectionByUserId as getMetaConnection } from '../metaAds/db';
import { getConnectionByUserId as getTikTokConnection } from './tiktok/db';

export type PlatformSchema = {
  platform: AdsPlatformId;
  insightsTable: string;
  accountsTable: string;
  campaignsTable: string;
  adsetsTable: string;
  adsTable: string;
  campaignIdCol: string;
  adsetIdCol: string;
};

export const PLATFORM_SCHEMAS: Record<AdsPlatformId, PlatformSchema> = {
  meta: {
    platform: 'meta',
    insightsTable: 'meta_insights_daily',
    accountsTable: 'meta_ad_accounts',
    campaignsTable: 'meta_campaigns',
    adsetsTable: 'meta_adsets',
    adsTable: 'meta_ads',
    campaignIdCol: 'campaign_id',
    adsetIdCol: 'adset_id',
  },
  tiktok: {
    platform: 'tiktok',
    insightsTable: 'tiktok_insights_daily',
    accountsTable: 'tiktok_ad_accounts',
    campaignsTable: 'tiktok_campaigns',
    adsetsTable: 'tiktok_adgroups',
    adsTable: 'tiktok_ads',
    campaignIdCol: 'campaign_id',
    adsetIdCol: 'adgroup_id',
  },
};

export async function connectionIdForPlatform(
  userId: number,
  platform: AdsPlatformId
): Promise<number | null> {
  if (platform === 'tiktok') {
    const c = await getTikTokConnection(userId);
    return c?.id ?? null;
  }
  const c = await getMetaConnection(userId);
  return c?.id ?? null;
}
