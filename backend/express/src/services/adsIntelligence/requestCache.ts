import { redisCacheGet, redisCacheSet } from '../redisCache';

type Entry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function getOrSetCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<{ value: T; cached: boolean; source?: 'memory' | 'redis' | 'origin' }> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { value: hit.value as T, cached: true, source: 'memory' };
  }

  const redisHit = await redisCacheGet<T>(key);
  if (redisHit !== null) {
    cache.set(key, { value: redisHit, expiresAt: now + ttlMs });
    return { value: redisHit, cached: true, source: 'redis' };
  }

  const pending = inflight.get(key);
  if (pending) {
    const value = (await pending) as T;
    return { value, cached: true, source: 'memory' };
  }

  const p = loader()
    .then(async (value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      await redisCacheSet(key, value, Math.ceil(ttlMs / 1000));
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  const value = await p;
  return { value, cached: false, source: 'origin' };
}
