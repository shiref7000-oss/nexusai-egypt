/**
 * Admin health helpers (used by legacy adminRoutes if present).
 * Canonical runtime health lives in runtimeHealth.ts and /api/admin/ops.
 */
export { getRuntimeHealthReport } from './runtimeHealth';
export type { RuntimeHealthReport } from './runtimeHealth';
