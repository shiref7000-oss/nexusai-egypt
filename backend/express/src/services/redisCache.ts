import { redis } from './queue';
import { env } from '../config/env';
import { logger } from '../config/logger';

function key(k: string) {
  return `${env.CACHE_REDIS_PREFIX}${k}`;
}

/** Redis L2 cache — never throws; returns null on failure. */
export async function redisCacheGet<T>(cacheKey: string): Promise<T | null> {
  try {
    if (redis.status !== 'ready') return null;
    const raw = await redis.get(key(cacheKey));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    logger.debug('Redis cache get miss', {
      key: cacheKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function redisCacheSet(cacheKey: string, value: unknown, ttlSec: number): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    await redis.set(key(cacheKey), JSON.stringify(value), 'EX', Math.max(1, ttlSec));
  } catch (err: unknown) {
    logger.debug('Redis cache set skipped', {
      key: cacheKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
