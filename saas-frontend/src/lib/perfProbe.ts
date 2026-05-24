/** Lightweight render + network counters for Engineering Agent dashboard profiling. */

type PerfSnapshot = {
  startedAt: number;
  renders: Record<string, number>;
  apiCalls: Record<string, number>;
  apiBytes: Record<string, number>;
};

declare global {
  interface Window {
    __EA_PERF__?: PerfSnapshot;
  }
}

function snapshot(): PerfSnapshot {
  if (typeof window === 'undefined') {
    return { startedAt: Date.now(), renders: {}, apiCalls: {}, apiBytes: {} };
  }
  if (!window.__EA_PERF__) {
    window.__EA_PERF__ = { startedAt: Date.now(), renders: {}, apiCalls: {}, apiBytes: {} };
  }
  return window.__EA_PERF__;
}

export function trackRender(component: string): void {
  const s = snapshot();
  s.renders[component] = (s.renders[component] ?? 0) + 1;
}

export function trackApiCall(endpoint: string, bytes: number): void {
  const s = snapshot();
  s.apiCalls[endpoint] = (s.apiCalls[endpoint] ?? 0) + 1;
  s.apiBytes[endpoint] = (s.apiBytes[endpoint] ?? 0) + bytes;
}

export function getPerfReport(): {
  elapsedSec: number;
  rendersPerSec: Record<string, number>;
  apiPerMin: Record<string, number>;
  totalApiPerMin: number;
  largestPayloadEndpoint: string | null;
  largestPayloadBytes: number;
} {
  const s = snapshot();
  const elapsedSec = Math.max(1, (Date.now() - s.startedAt) / 1000);
  const rendersPerSec: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.renders)) {
    rendersPerSec[k] = Math.round((v / elapsedSec) * 100) / 100;
  }
  const apiPerMin: Record<string, number> = {};
  let totalApiPerMin = 0;
  for (const [k, v] of Object.entries(s.apiCalls)) {
    const perMin = Math.round((v / elapsedSec) * 60 * 10) / 10;
    apiPerMin[k] = perMin;
    totalApiPerMin += perMin;
  }
  let largestPayloadEndpoint: string | null = null;
  let largestPayloadBytes = 0;
  for (const [k, b] of Object.entries(s.apiBytes)) {
    const calls = s.apiCalls[k] ?? 1;
    const avg = b / calls;
    if (avg > largestPayloadBytes) {
      largestPayloadBytes = Math.round(avg);
      largestPayloadEndpoint = k;
    }
  }
  return {
    elapsedSec,
    rendersPerSec,
    apiPerMin,
    totalApiPerMin,
    largestPayloadEndpoint,
    largestPayloadBytes,
  };
}

export function resetPerfProbe(): void {
  if (typeof window !== 'undefined') {
    window.__EA_PERF__ = { startedAt: Date.now(), renders: {}, apiCalls: {}, apiBytes: {} };
  }
}
