/**
 * Provider registry — add Snapchat, Google Ads, Pinterest, Kwai here.
 */
import type { AdsPlatformId } from './types';

export type AdsProviderModule = {
  id: AdsPlatformId;
  label: string;
  oauthPath: string;
  syncPath: string;
};

export const ADS_PROVIDERS: AdsProviderModule[] = [
  { id: 'meta', label: 'Meta', oauthPath: '/api/meta/oauth/start', syncPath: '/api/meta/sync' },
  { id: 'tiktok', label: 'TikTok', oauthPath: '/api/tiktok/oauth/start', syncPath: '/api/tiktok/sync' },
];

export function getProvider(id: AdsPlatformId): AdsProviderModule | undefined {
  return ADS_PROVIDERS.find((p) => p.id === id);
}
