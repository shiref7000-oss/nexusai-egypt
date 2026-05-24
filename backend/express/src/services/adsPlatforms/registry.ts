import type { AdsPlatformId, AdsPlatformScope } from './types';

/** Registered platforms — extend for Snapchat, Google Ads, etc. */
export const SUPPORTED_PLATFORMS: AdsPlatformId[] = ['meta', 'tiktok'];

export function isSupportedPlatform(platform: string): platform is AdsPlatformId {
  return SUPPORTED_PLATFORMS.includes(platform as AdsPlatformId);
}

export function normalizePlatform(platform?: string): AdsPlatformId {
  const p = (platform || 'meta').toLowerCase();
  if (p === 'tiktok') return 'tiktok';
  return 'meta';
}

export function normalizePlatformScope(platform?: string): AdsPlatformScope {
  const p = (platform || 'meta').toLowerCase();
  if (p === 'combined' || p === 'all') return 'combined';
  if (p === 'tiktok') return 'tiktok';
  return 'meta';
}
