import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { ArrowLeft, Loader2, RefreshCw, RotateCcw, Rocket } from 'lucide-react';
import {
  adminApi,
  type EngineeringDeploymentDetail,
  type EngineeringDeploymentRow,
} from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    success: 'bg-emerald-500/15 text-emerald-400',
    running: 'bg-amber-500/15 text-amber-300',
    failed: 'bg-red-500/15 text-red-400',
    rolled_back: 'bg-violet-500/15 text-violet-300',
    pending: 'bg-zinc-500/15 text-zinc-400',
  };
  return map[status] || 'bg-zinc-500/15 text-zinc-400';
}

function deployStageLabel(stage: string | null) {
  if (!stage) return '—';
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EngineeringAgentDeploymentsPage() {
  const [deployments, setDeployments] = useState<EngineeringDeploymentRow[]>([]);
  const [current, setCurrent] = useState<{
    running: EngineeringDeploymentRow | null;
    latest: EngineeringDeploymentRow | null;
  } | null>(null);
  const [selected, setSelected] = useState<EngineeringDeploymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, cur] = await Promise.all([
        adminApi.engineeringDeployments({ limit: '50' }),
        adminApi.engineeringDeploymentCurrent(),
      ]);
      setDeployments(list.data);
      setCurrent(cur.data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await adminApi.engineeringDeployment(id);
      setSelected(res.data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deployment');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRollback = async (deploymentId: string) => {
    if (!confirm('Restore the backup from this deployment and restart services?')) return;
    setRollingBack(deploymentId);
    try {
      await adminApi.engineeringRollbackDeployment(deploymentId);
      toast.success('Rollback completed');
      await load();
      await openDetail(deploymentId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[40vh] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading deployments…
      </div>
    );
  }

  const running = current?.running;

  return (
    <div className="page-shell max-w-6xl mx-auto space-y-6 pb-10">
      <Toaster position="top-center" richColors />
      <div className="flex items-center gap-3">
        <Link to="/admin/engineering-agent">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Monitor
          </Button>
        </Link>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <PageHeader
        title="Engineering Agent — Deployments"
        description="Explicit admin approval required. No automatic deploy after task completion."
      />

      <Card>
        <CardHeader title="Current deployment status" />
        <CardBody className="text-sm space-y-2">
          {running ? (
            <p className="text-amber-300 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Deployment in progress ({running.status}) — task{' '}
              <Link className="text-brand underline" to={`/admin/engineering-agent/task/${running.taskId}`}>
                {running.taskTitle || running.taskId.slice(0, 8)}
              </Link>
            </p>
          ) : (
            <p className="text-zinc-400">No deployment currently running.</p>
          )}
          {current?.latest && (
            <p className="text-zinc-500">
              Latest:{' '}
              <button type="button" className="text-brand underline" onClick={() => void openDetail(current.latest!.id)}>
                {current.latest.startedAt ? new Date(current.latest.startedAt).toLocaleString() : '—'}
              </button>{' '}
              · {current.latest.status} · by {current.latest.startedByEmail}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Deployment history" description="Full audit trail — who deployed, when, health checks" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Task</th>
                <th className="py-2 pr-3">By</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Health</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deployments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-zinc-500 text-center">
                    No deployments yet. Deploy from a completed task with a passed build.
                  </td>
                </tr>
              ) : (
                deployments.map((d) => {
                  const checks = (d.healthChecks || []) as Array<{ ok: boolean }>;
                  const healthOk = checks.length > 0 && checks.every((c) => c.ok);
                  return (
                    <tr key={d.id} className="border-b border-zinc-800/60 hover:bg-white/[0.02]">
                      <td className="py-3 pr-3 text-zinc-400 whitespace-nowrap">
                        {new Date(d.startedAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-3">
                        <Link
                          to={`/admin/engineering-agent/task/${d.taskId}`}
                          className="text-brand hover:underline"
                        >
                          {d.taskTitle || d.taskId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-3 pr-3 text-zinc-400">{d.startedByEmail}</td>
                      <td className="py-3 pr-3">
                        <span className={cn('px-2 py-0.5 rounded text-xs', statusBadge(d.status))}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {checks.length === 0 ? (
                          '—'
                        ) : healthOk ? (
                          <span className="text-emerald-400">OK</span>
                        ) : (
                          <span className="text-red-400">Failed</span>
                        )}
                      </td>
                      <td className="py-3 flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => void openDetail(d.id)}>
                          Details
                        </Button>
                        {d.status === 'success' && d.backupId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={rollingBack === d.id}
                            onClick={() => void handleRollback(d.id)}
                          >
                            {rollingBack === d.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3 mr-1" />
                            )}
                            Rollback
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {(selected || detailLoading) && (
        <Card>
          <CardHeader
            title="Deployment detail"
            description={selected ? `Stage: ${deployStageLabel(selected.deployment.deployStage)}` : ''}
          />
          <CardBody className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
            {detailLoading && !selected ? (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            ) : selected ? (
              <>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                </div>
                <p>
                  <span className="text-zinc-500">ID:</span>{' '}
                  <span className="font-mono">{selected.deployment.id}</span>
                </p>
                <p>
                  <span className="text-zinc-500">Started by:</span> {selected.deployment.startedByEmail}
                </p>
                {selected.deployment.errorMessage && (
                  <p className="text-red-400">{selected.deployment.errorMessage}</p>
                )}

                {selected.backup && (
                  <div className="rounded border border-zinc-800 p-3 space-y-1">
                    <p className="font-medium text-zinc-300">Backup</p>
                    <p className="text-zinc-500">Stamp: {selected.backup.stamp}</p>
                    <p className="text-zinc-500 font-mono text-xs break-all">
                      App: {selected.backup.appBackupPath || '—'}
                    </p>
                    <p className="text-zinc-500 font-mono text-xs break-all">
                      DB: {selected.backup.dbBackupPath || '—'}
                    </p>
                  </div>
                )}

                <div>
                  <p className="font-medium text-zinc-300 mb-2">Health checks</p>
                  <ul className="space-y-1">
                    {(selected.deployment.healthChecks || []).map((h, i) => (
                      <li key={i} className={h.ok ? 'text-emerald-400' : 'text-red-400'}>
                        {h.name}: {h.ok ? 'OK' : 'FAIL'}
                        {h.detail ? ` — ${String(h.detail).slice(0, 120)}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="font-medium text-zinc-300 mb-2">Commands executed</p>
                  <div className="space-y-2 font-mono text-xs">
                    {(selected.deployment.commandsLog || []).map((c, i) => (
                      <div key={i} className="border border-zinc-800 rounded p-2">
                        <p className={c.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}>
                          [{c.exitCode}] {c.command}
                        </p>
                        {c.stdout && <pre className="text-zinc-500 mt-1 whitespace-pre-wrap">{c.stdout.slice(0, 800)}</pre>}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-medium text-zinc-300 mb-2">Log stream</p>
                  <div className="space-y-1 font-mono text-xs">
                    {selected.logs.map((l) => (
                      <p key={l.id} className={l.level === 'error' ? 'text-red-400' : 'text-zinc-400'}>
                        {new Date(l.createdAt).toLocaleTimeString()} [{l.level}] {l.message}
                      </p>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-zinc-600 flex items-center gap-1">
        <Rocket className="h-3 w-3" />
        Use Deploy To Production on a task detail page when status is completed and build passed.
      </p>
    </div>
  );
}
