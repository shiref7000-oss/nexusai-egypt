const WORKSPACE_USER_KEY = 'nexusai_workspace_user_id';

export function getWorkspaceUserId(): number | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_USER_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setWorkspaceUserId(id: number | null): void {
  try {
    if (id == null) localStorage.removeItem(WORKSPACE_USER_KEY);
    else localStorage.setItem(WORKSPACE_USER_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export function workspaceHeaders(): HeadersInit {
  const id = getWorkspaceUserId();
  return id ? { 'X-Workspace-User-Id': String(id) } : {};
}
