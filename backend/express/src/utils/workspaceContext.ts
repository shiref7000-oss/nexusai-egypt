import { Response } from 'express';
import { pool } from '../config/db_pg';
import type { AuthenticatedRequest } from '../middleware/auth';

export const REPORTING_PERMISSIONS = [
  'reports:read',
  'reports:write',
  'reports:export',
  'analytics:read',
  'cost_analyzer:read',
  'cost_analyzer:write',
  'meta_ads:read',
  'tiktok_ads:read',
  'whatsapp:read',
  'orders:read',
] as const;

export type ReportingPermission = (typeof REPORTING_PERMISSIONS)[number];

export interface WorkspaceContextDebug {
  authenticatedUserId: number | null;
  role: string;
  tenantId: number | null;
  workspaceUserId: number | null;
  requestedWorkspaceUserId: number | null;
  permissions: ReportingPermission[];
}

export function isPlatformAdmin(role?: string): boolean {
  return role === 'admin' || role === 'superadmin';
}

/** Admins inherit every reporting permission; merchants get read + limited write. */
export function reportingPermissionsForRole(role?: string): ReportingPermission[] {
  if (isPlatformAdmin(role)) return [...REPORTING_PERMISSIONS];
  return REPORTING_PERMISSIONS.filter(
    (p) => p.endsWith(':read') || p === 'cost_analyzer:write' || p === 'reports:export'
  );
}

export function actorPgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

function parseRequestedWorkspaceUserId(req: AuthenticatedRequest): number | null {
  const header = req.headers['x-workspace-user-id'];
  const raw =
    typeof header === 'string'
      ? header
      : Array.isArray(header)
        ? header[0]
        : req.query.userId ?? req.query.workspaceUserId;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type WorkspaceResolveResult = {
  userId: number | null;
  error?: string;
  status?: number;
  context: WorkspaceContextDebug;
};

export async function resolveWorkspaceUserId(req: AuthenticatedRequest): Promise<WorkspaceResolveResult> {
  const actorId = actorPgUserId(req);
  const role = req.user?.role || 'user';
  const requested = parseRequestedWorkspaceUserId(req);

  const context: WorkspaceContextDebug = {
    authenticatedUserId: actorId,
    role,
    tenantId: actorId,
    workspaceUserId: actorId,
    requestedWorkspaceUserId: requested,
    permissions: reportingPermissionsForRole(role),
  };

  if (!actorId) {
    return { userId: null, error: 'Account not linked', status: 400, context };
  }

  if (!isPlatformAdmin(role)) {
    if (requested != null && requested !== actorId) {
      return {
        userId: null,
        error: 'Cannot access another workspace',
        status: 403,
        context,
      };
    }
    context.workspaceUserId = actorId;
    context.tenantId = actorId;
    return { userId: actorId, context };
  }

  if (requested != null) {
    const check = await pool.query('SELECT id FROM users WHERE id = $1', [requested]);
    if (check.rows.length === 0) {
      return { userId: null, error: 'Workspace user not found', status: 404, context };
    }
    context.workspaceUserId = requested;
    context.tenantId = requested;
    return { userId: requested, context };
  }

  context.workspaceUserId = actorId;
  context.tenantId = actorId;
  return { userId: actorId, context };
}

export function wantsWorkspaceDebug(req: AuthenticatedRequest): boolean {
  return req.query.debug === '1' || req.headers['x-debug-workspace'] === '1';
}

export function sendWorkspaceDebug(res: Response, context: WorkspaceContextDebug): void {
  try {
    res.setHeader('X-Workspace-Context', JSON.stringify(context));
  } catch {
    /* ignore */
  }
}
