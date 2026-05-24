import { useCallback, useEffect, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { adminApi, type AuditLog } from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', actor: '', entity: '', search: '' });
  const [draft, setDraft] = useState(filters);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '30' };
      if (filters.action) params.action = filters.action;
      if (filters.actor) params.actor = filters.actor;
      if (filters.entity) params.entity = filters.entity;
      if (filters.search) params.search = filters.search;
      const res = await adminApi.auditLogs(params);
      setLogs(res.data.logs);
      setTotal(res.data.pagination.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setFilters(draft);
  };

  return (
    <div className="page-shell max-w-6xl mx-auto space-y-6 pb-10">
      <Toaster position="top-center" richColors />
      <PageHeader title="Audit logs" description="Admin actions recorded in PostgreSQL." />

      <Card>
        <CardBody>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Input
              placeholder="Action type"
              value={draft.action}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            />
            <Input
              placeholder="Actor email"
              value={draft.actor}
              onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
            />
            <Input
              placeholder="Entity type"
              value={draft.entity}
              onChange={(e) => setDraft({ ...draft, entity: e.target.value })}
            />
            <Input
              placeholder="Search target"
              value={draft.search}
              onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            />
          </div>
          <div className="flex gap-2 mb-6">
            <Button type="button" onClick={applyFilters}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const empty = { action: '', actor: '', entity: '', search: '' };
                setDraft(empty);
                setFilters(empty);
                setPage(1);
              }}
            >
              Clear
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                  <th className="text-left pb-2 font-medium">When</th>
                  <th className="text-left pb-2 font-medium">Actor</th>
                  <th className="text-left pb-2 font-medium">Action</th>
                  <th className="text-left pb-2 font-medium">Entity</th>
                  <th className="text-left pb-2 font-medium">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      Loading…
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      No entries match your filters.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-xs">{log.admin_email}</td>
                      <td className="py-2.5 font-mono text-xs text-zinc-300">{log.action}</td>
                      <td className="py-2.5 text-zinc-400 capitalize">{log.target_type}</td>
                      <td className="py-2.5 text-zinc-400 text-xs">
                        {log.target_email || log.target_id}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-zinc-500">
            <span>
              {total} entries · page {page}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={page * 30 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
