import { getEngineeringMetrics } from './taskMonitor';

type CacheEntry = { at: number; data: Awaited<ReturnType<typeof getEngineeringMetrics>> };

let cache: CacheEntry | null = null;
const TTL_MS = 30_000;

export async function getEngineeringMetricsCached(): Promise<CacheEntry['data']> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  const data = await getEngineeringMetrics();
  cache = { at: now, data };
  return data;
}

export function invalidateEngineeringMetricsCache(): void {
  cache = null;
}
