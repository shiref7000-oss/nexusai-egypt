import { useCallback, useEffect, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { KeyRound, Trash2, UserCog } from 'lucide-react';
import {
  adminApi,
  planFromApi,
  planToApi,
  type AdminPlan,
  type AdminStatus,
  type AdminUser,
} from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';

const PLANS: { value: AdminPlan; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const STATUSES: { value: AdminStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending' },
];

const statusClass: Record<string, string> = {
  active: 'text-green-400',
  suspended: 'text-red-400',
  pending: 'text-yellow-400',
  inactive: 'text-gray-400',
};

type Draft = { plan: AdminPlan; status: AdminStatus };

export default function AdminUsersPage() {
  const { user: actor } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.users(search ? { search } : undefined);
      const list = res.data.users;
      setUsers(list);
      const next: Record<number, Draft> = {};
      for (const u of list) {
        next[u.id] = {
          plan: planFromApi(u.plan),
          status: (u.status as AdminStatus) || 'active',
        };
      }
      setDrafts(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (id: number, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const mergeUser = (updated: AdminUser) => {
    setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    setDrafts((d) => ({
      ...d,
      [updated.id]: {
        plan: planFromApi(updated.plan),
        status: (updated.status as AdminStatus) || 'active',
      },
    }));
  };

  const saveRow = async (u: AdminUser) => {
    const draft = drafts[u.id];
    if (!draft) return;

    const planChanged = planFromApi(u.plan) !== draft.plan;
    const statusChanged = u.status !== draft.status;
    if (!planChanged && !statusChanged) {
      toast.message('No changes to save');
      return;
    }

    setSaving((s) => ({ ...s, [u.id]: true }));
    const optimistic: AdminUser = {
      ...u,
      plan: draft.plan === 'basic' ? 'basic' : draft.plan,
      status: draft.status,
    };
    setUsers((list) => list.map((row) => (row.id === u.id ? optimistic : row)));

    try {
      let latest = u;
      if (planChanged) {
        const res = await adminApi.patchPlan(u.id, draft.plan);
        latest = res.data.user;
        mergeUser(latest);
      }
      if (statusChanged) {
        const res = await adminApi.patchStatus(u.id, draft.status);
        latest = res.data.user;
        mergeUser(latest);
      }
      toast.success('User updated');
    } catch (e: unknown) {
      mergeUser(u);
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving((s) => ({ ...s, [u.id]: false }));
    }
  };

  const resetPassword = async (id: number) => {
    const pwd = window.prompt('Enter new password (min 6 characters)');
    if (!pwd) return;
    try {
      await adminApi.resetPassword(id, pwd);
      toast.success('Password reset');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reset failed');
    }
  };

  const deleteUser = async (id: number, label: string) => {
    if (!window.confirm(`Delete user ${label}?`)) return;
    try {
      await adminApi.deleteUser(id);
      toast.success('User deleted');
      setUsers((list) => list.filter((u) => u.id !== id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const impersonate = async (id: number) => {
    try {
      const res = await adminApi.impersonate(id);
      localStorage.setItem('nexusai_impersonator', localStorage.getItem('nexusai_token') || '');
      localStorage.setItem('nexusai_token', res.data.token);
      localStorage.setItem('nexusai_user', JSON.stringify(res.data.user));
      window.location.assign('/dashboard');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Impersonation failed');
    }
  };

  const isSuperadmin = actor?.role === 'superadmin';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Toaster position="top-right" richColors />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-gray-500 text-sm">Plan, status, and account controls</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-gray-400 text-left">
              <th className="p-3">User</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Usage</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : !users.length ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const draft = drafts[u.id] || {
                  plan: planFromApi(u.plan),
                  status: (u.status as AdminStatus) || 'active',
                };
                const usage = u.usage || {
                  monthlyUsed: u.monthly_requests_used ?? 0,
                  monthlyLimit: u.monthly_request_limit ?? 0,
                };
                const dirty =
                  planFromApi(u.plan) !== draft.plan || u.status !== draft.status;

                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="p-3">
                      <p className="font-medium">{u.full_name || 'No name'}</p>
                      <p className="text-gray-500 text-xs">{u.email}</p>
                      <p className="text-gray-600 text-xs">{u.role}</p>
                    </td>
                    <td className="p-3 w-36">
                      <Select
                        value={draft.plan}
                        onValueChange={(v) => setDraft(u.id, { plan: v as AdminPlan })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 w-36">
                      <Select
                        value={draft.status}
                        onValueChange={(v) => setDraft(u.id, { status: v as AdminStatus })}
                      >
                        <SelectTrigger>
                          <SelectValue>
                            <span className={statusClass[draft.status]}>{draft.status}</span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {usage.monthlyUsed} / {usage.monthlyLimit}
                      <span className="block text-gray-600">API: {planToApi(draft.plan)}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 items-center">
                        <Button
                          size="sm"
                          disabled={!dirty || saving[u.id]}
                          onClick={() => saveRow(u)}
                        >
                          {saving[u.id] ? 'Saving…' : 'Save'}
                        </Button>
                        <Button size="icon" variant="ghost" title="Reset password" onClick={() => resetPassword(u.id)}>
                          <KeyRound className="w-4 h-4 text-yellow-400" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Login as user" onClick={() => impersonate(u.id)}>
                          <UserCog className="w-4 h-4 text-blue-400" />
                        </Button>
                        {isSuperadmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            onClick={() => deleteUser(u.id, u.email)}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
