import crypto from 'crypto';

export function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex').slice(0, 64);
}

export function creativeKey(platform: string, adId: string, thumbnailUrl?: string | null): string {
  return contentHash(`${platform}:${adId}:${thumbnailUrl || ''}`);
}
