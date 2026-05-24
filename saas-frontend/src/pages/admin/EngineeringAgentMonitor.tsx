import { memo, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { RefreshCw, Loader2, ExternalLink, Plus } from 'lucide-react';
import { adminApi, type EngineeringAgentTaskRow } from '@/lib/adminApi';
import { PageHeader, StatCard } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentSmokeTestCard } from '@/components/AgentSmokeTestCard';
import { trackRender } from '@/lib/perfProbe';

function formatDuration(ms: number | null) {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function phaseColor(phase: string) {
  if (phase === 'completed') return 'text-emerald-400';
  if (phase === 'failed' || phase === 'verification_failed') return 'text-red-400';
  if (phase === 'verification_incomplete') return 'text-amber-400';
  if (
    [
      'running_build',
      'running_tests',
      'writing_files',
      'verification_execution',
      'evidence_collection',
    ].includes(phase)
  ) {
    return 'text-amber-300';
  }
  return 'text-zinc-400';
}

function formatPhase(phase: string) {
  return phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusDot(ok: boolean | undefined) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full shrink-0', ok ? 'bg-emerald-400' : 'bg-red-400')}
      aria-hidden
    />
  );
}

const TaskRow = memo(function TaskRow({ t }: { t: EngineeringAgentTaskRow }) {
  trackRender('TaskRow');
  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
      <td className="py-2.5 pr-3 font-mono text-xs text-zinc-500">{t.id.slice(0, 8)}…</td>
      <td className="py-2.5 pr-3 text-xs capitalize text-zinc-400">
        {t.taskType || 'implementation'}
      </td>
      <td className="py-2.5 pr-3 max-w-[200px] truncate text-zinc-300" title={t.prompt}>
        {t.title || t.prompt}
      </td>
      <td className={cn('py-2.5 pr-3 capitalize', phaseColor(t.status))}>{t.status}</td>
      <td className={cn('py-2.5 pr-3 text-xs', phaseColor(t.pipelinePhase || t.currentPhase))}>
        {t.pipelinePhaseLabel || formatPhase(t.currentPhase)}
      </td>
      <td className="py-2.5 pr-3">
        <div className="w-16 h-1.5 bg-zinc-800 rounded overflow-hidden">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${t.progressPercent}%` }}
          />
        </div>
      </td>
      <td className="py-2.5 pr-3 text-xs text-zinc-500 whitespace-nowrap">
        {t.startedAt ? new Date(t.startedAt).toLocaleString() : '—'}
      </td>
      <td className="py-2.5 pr-3 text-xs text-zinc-500 whitespace-nowrap">
        {new Date(t.updatedAt).toLocaleString()}
      </td>
      <td className="py-2.5 pr-3 text-xs">{formatDuration(t.durationMs)}</td>
      <td className="py-2.5 pr-3 text-xs">{t.filesReadCount}</td>
      <td className="py-2.5 pr-3 text-xs">{t.filesWrittenCount}</td>
      <td className="py-2.5 pr-3 text-xs capitalize">{t.buildStatus || '—'}</td>
      <td className="py-2.5 pr-3 text-xs tabular-nums">
        {t.confidenceScore != null ? t.confidenceScore.toFixed(0) : '—'}
        {t.deploymentBlocked && (
          <span className="ml-1 text-red-400" title="Deployment blocked">
            ⛔
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-xs text-zinc-400">
        {t.deployStage ? t.deployStage.replace(/_/g, ' ') : '—'}
      </td>
      <td className="py-2.5">
        <Link
          to={`/admin/engineering-agent/task/${t.id}`}
          className="inline-flex items-center text-brand hover:underline text-xs"
        >
          Open <ExternalLink className="h-3 w-3 ml-1" />
        </Link>
      </td>
    </tr>
  );
});

export default function EngineeringAgentMonitorPage() {
  trackRender('EngineeringAgentMonitor');
  const [metrics, setMetrics] = useState<{
    totalTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    avgCompletionMs: number;
    filesModifiedToday: number;
    buildSuccessRate: number | null;
    scorecard?: {
      taskSuccessRate: number | null;
      buildPassRate: number | null;
      verificationPassRate: number | null;
      deploymentBlockedCount: number;
      avgConfidenceScore: number;
      periodDays: number;
    } | null;
  } | null>(null);
  const [tasks, setTasks] = useState<EngineeringAgentTaskRow[]>([]);
  const [system, setSystem] = useState<{
    status: string;
    database?: { ok: boolean; latencyMs: number | null };
    redis?: { ok: boolean; status: string };
    workflows?: { failedLast24h: number; running: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMonitor = useCallback(async () => {
    try {
      const res = await adminApi.engineeringAgentMonitor();
      setMetrics(res.data.metrics as typeof metrics);
      setTasks(res.data.tasks);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load monitor data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSystem = useCallback(async () => {
    try {
      const opsRes = await adminApi.ops();
      const ops = (opsRes as { data?: { system?: typeof system } }).data;
      setSystem(ops?.system ?? null);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void loadMonitor();
    const iv = setInterval(() => void loadMonitor(), 5000);
    return () => clearInterval(iv);
  }, [loadMonitor]);

  useEffect(() => {
    void loadSystem();
    const iv = setInterval(() => void loadSystem(), 60_000);
    return () => clearInterval(iv);
  }, [loadSystem]);

  const refreshAll = () => {
    void loadMonitor();
    void loadSystem();
  };

  return (
    <div className="page-shell max-w-[1400px] mx-auto space-y-6 pb-10">
      <Toaster position="top-center" richColors />
      <PageHeader
        title="Engineering Agent Monitor"
        description="Real-time visibility into developer agent tasks, tool calls, and builds."
        action={
          <div className="flex items-center gap-2">
            <Link to="/ai-developer">
              <Button variant="primary" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New task
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={refreshAll} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody>
          <CardHeader title="System status" description="Platform health from /api/admin/ops (refreshes every 60s)" />
          {!system ? (
            <p className="text-sm text-zinc-500">Loading system health…</p>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2">
                <span className="text-zinc-400">Platform</span>
                <span className="flex items-center gap-2 capitalize">
                  {statusDot(system.status === 'healthy')}
                  {system.status}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2">
                <span className="text-zinc-400">Database</span>
                <span className="flex items-center gap-2">
                  {statusDot(system.database?.ok)}
                  {system.database?.latencyMs != null ? `${system.database.latencyMs}ms` : '—'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2">
                <span className="text-zinc-400">Redis</span>
                <span className="flex items-center gap-2 capitalize">
                  {statusDot(system.redis?.ok)}
                  {system.redis?.status ?? '—'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2">
                <span className="text-zinc-400">Workflows failing (24h)</span>
                <span className="tabular-nums">{system.workflows?.failedLast24h ?? 0}</span>
              </li>
            </ul>
          )}
        </CardBody>
      </Card>

      <AgentSmokeTestCard />

      {metrics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="Total tasks" value={metrics.totalTasks} />
            <StatCard label="Running" value={metrics.runningTasks} />
            <StatCard label="Completed" value={metrics.completedTasks} />
            <StatCard label="Failed" value={metrics.failedTasks} />
            <StatCard label="Avg duration" value={formatDuration(metrics.avgCompletionMs)} />
            <StatCard label="Files today" value={metrics.filesModifiedToday} />
            <StatCard
              label="Build success"
              value={metrics.buildSuccessRate != null ? `${metrics.buildSuccessRate}%` : '—'}
            />
          </div>
          {metrics.scorecard && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard
                label={`Task success (${metrics.scorecard.periodDays}d)`}
                value={
                  metrics.scorecard.taskSuccessRate != null
                    ? `${metrics.scorecard.taskSuccessRate}%`
                    : '—'
                }
              />
              <StatCard
                label="Verify pass rate"
                value={
                  metrics.scorecard.verificationPassRate != null
                    ? `${metrics.scorecard.verificationPassRate}%`
                    : '—'
                }
              />
              <StatCard
                label="Avg confidence"
                value={
                  metrics.scorecard.avgConfidenceScore > 0
                    ? metrics.scorecard.avgConfidenceScore.toFixed(1)
                    : '—'
                }
              />
              <StatCard
                label="Deploy blocked"
                value={metrics.scorecard.deploymentBlockedCount}
              />
            </div>
          )}
        </>
      )}

      <Card>
        <CardHeader title="Live tasks" description="Auto-refreshes every 5 seconds (single monitor API)" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-800">
                <th className="py-2 pr-3">Task ID</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Prompt</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Step</th>
                <th className="py-2 pr-3">Progress</th>
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Updated</th>
                <th className="py-2 pr-3">Duration</th>
                <th className="py-2 pr-3">Read</th>
                <th className="py-2 pr-3">Written</th>
                <th className="py-2 pr-3">Build</th>
                <th className="py-2 pr-3">Conf.</th>
                <th className="py-2 pr-3">Deploy</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-zinc-500">
                    No engineering tasks yet.
                  </td>
                </tr>
              )}
              {tasks.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
