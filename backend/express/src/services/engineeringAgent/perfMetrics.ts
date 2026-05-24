/**
 * In-process metrics for /api/admin/engineering-agent routes (API timing, payload size, DB).
 */

export type EngineeringAgentPerfEntry = {
  path: string;
  method: string;
  durationMs: number;
  responseBytes: number;
  dbMs: number;
  dbQueries: number;
  at: number;
};

const MAX = 5000;
const buffer: EngineeringAgentPerfEntry[] = [];

let activeDbMs = 0;
let activeDbQueries = 0;

export function startDbSpan(): void {
  activeDbQueries += 1;
}

export function endDbSpan(ms: number): void {
  activeDbMs += ms;
}

export function recordEngineeringAgentRequest(entry: Omit<EngineeringAgentPerfEntry, 'at'>): void {
  buffer.push({ ...entry, at: Date.now() });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
}

export function takeDbSpanTotals(): { dbMs: number; dbQueries: number } {
  const out = { dbMs: activeDbMs, dbQueries: activeDbQueries };
  activeDbMs = 0;
  activeDbQueries = 0;
  return out;
}

export function getEngineeringAgentPerfReport(windowMinutes = 10): {
  windowMinutes: number;
  apiRequestsPerMinute: number;
  avgDurationMs: number;
  p95DurationMs: number;
  largestPayload: { path: string; bytes: number } | null;
  slowestRoutes: Array<{ path: string; avgMs: number; count: number; avgBytes: number }>;
  slowestDbFeatures: Array<{ path: string; avgDbMs: number; count: number }>;
  byFeature: Record<string, { requests: number; avgMs: number; totalBytes: number }>;
} {
  const cutoff = Date.now() - windowMinutes * 60_000;
  const recent = buffer.filter((e) => e.at >= cutoff);
  const windowMs = windowMinutes * 60_000;
  const apiRequestsPerMinute = recent.length > 0 ? (recent.length / windowMs) * 60_000 : 0;

  const durations = recent.map((e) => e.durationMs).sort((a, b) => a - b);
  const avgDurationMs =
    durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;
  const p95DurationMs =
    durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;

  let largestPayload: { path: string; bytes: number } | null = null;
  for (const e of recent) {
    if (!largestPayload || e.responseBytes > largestPayload.bytes) {
      largestPayload = { path: e.path, bytes: e.responseBytes };
    }
  }

  const byPath = new Map<string, { sumMs: number; sumBytes: number; sumDb: number; count: number }>();
  for (const e of recent) {
    const cur = byPath.get(e.path) || { sumMs: 0, sumBytes: 0, sumDb: 0, count: 0 };
    cur.sumMs += e.durationMs;
    cur.sumBytes += e.responseBytes;
    cur.sumDb += e.dbMs;
    cur.count += 1;
    byPath.set(e.path, cur);
  }

  const slowestRoutes = [...byPath.entries()]
    .map(([path, v]) => ({
      path,
      avgMs: Math.round(v.sumMs / v.count),
      count: v.count,
      avgBytes: Math.round(v.sumBytes / v.count),
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  const slowestDbFeatures = [...byPath.entries()]
    .map(([path, v]) => ({
      path,
      avgDbMs: Math.round(v.sumDb / v.count),
      count: v.count,
    }))
    .filter((x) => x.avgDbMs > 0)
    .sort((a, b) => b.avgDbMs - a.avgDbMs)
    .slice(0, 10);

  const featureOf = (path: string): string => {
    if (path.includes('/tasks/') && path.includes('/activity')) return 'task_activity_poll';
    if (path.includes('/tasks/') && path.includes('/summary')) return 'task_summary_poll';
    if (path.match(/\/tasks\/[^/]+$/)) return 'task_detail';
    if (path.endsWith('/tasks')) return 'task_list';
    if (path.endsWith('/metrics')) return 'metrics';
    if (path.endsWith('/monitor')) return 'monitor_snapshot';
    return 'other';
  };

  const byFeature: Record<string, { requests: number; avgMs: number; totalBytes: number }> = {};
  for (const e of recent) {
    const f = featureOf(e.path);
    const cur = byFeature[f] || { requests: 0, avgMs: 0, totalBytes: 0 };
    cur.requests += 1;
    cur.avgMs += e.durationMs;
    cur.totalBytes += e.responseBytes;
    byFeature[f] = cur;
  }
  for (const k of Object.keys(byFeature)) {
    const cur = byFeature[k];
    cur.avgMs = cur.requests > 0 ? Math.round(cur.avgMs / cur.requests) : 0;
  }

  return {
    windowMinutes,
    apiRequestsPerMinute: Math.round(apiRequestsPerMinute * 10) / 10,
    avgDurationMs,
    p95DurationMs,
    largestPayload,
    slowestRoutes,
    slowestDbFeatures,
    byFeature,
  };
}
