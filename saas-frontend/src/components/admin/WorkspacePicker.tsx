import { useCallback, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { adminApi, type AdminUser } from '@/lib/adminApi';
import { getWorkspaceUserId, setWorkspaceUserId } from '@/lib/workspaceContext';
import { useAuth } from '@/hooks/useAuth';

/** Lets platform admins scope reporting APIs to a merchant workspace (tenant user). */
export function WorkspacePicker() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<number | null>(() => getWorkspaceUserId());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.users({ limit: '200' });
      const merchants = (res.data.users || []).filter(
        (u) => u.role !== 'admin' && u.role !== 'superadmin'
      );
      setUsers(merchants);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const onChange = (value: string) => {
    const id = value ? parseInt(value, 10) : null;
    setSelected(id);
    setWorkspaceUserId(id);
    window.dispatchEvent(new CustomEvent('nexusai-workspace-changed', { detail: { userId: id } }));
  };

  return (
    <div className="px-3 pb-3">
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
        <Building2 className="h-3 w-3" />
        Workspace
      </label>
      <select
        className="w-full rounded-lg border border-white/[0.08] bg-elevated/80 px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20"
        value={selected != null ? String(selected) : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        aria-label="Select merchant workspace for reports"
      >
        <option value="">My admin account</option>
        {users.map((u) => (
          <option key={u.id} value={String(u.id)}>
            {u.full_name || u.email} ({u.plan})
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
        Reports, Meta Ads, and analytics use this tenant.
      </p>
    </div>
  );
}
