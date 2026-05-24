import { useCallback, useEffect, useState } from 'react';
import { Activity, GitBranch, Play, RefreshCw, Zap } from 'lucide-react';
import { workflowStateClass, workflowStateLabel } from '@/lib/agentsApi';
import {
  workflowsApi,
  type WorkflowExecutionRecord,
  type WorkflowMonitoringRow,
} from '@/lib/workflowsApi';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard, Skeleton } from '@/components/ui/page';

function formatMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowMonitoringRow[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [n8n, setN8n] = useState<{ reachable: boolean; message: string } | null>(null);
  const [queue, setQueue] = useState<Record<string, unknown> | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastTestSummary, setLastTestSummary] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    workflowsApi
      .monitoring()
      .then((r) => {
        if (!r.success) throw new Error('Failed to load monitoring data');
        setWorkflows(r.data.workflows || []);
        setExecutions(r.data.executions || []);
        setN8n(r.data.n8n);
        setQueue((r.data.queue as Record<string, unknown>) || null);
        setGeneratedAt(r.data.generatedAt);
        setRuntimeStatus((r.data.runtime as { status?: string } | null)?.status || null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function runOne(w: WorkflowMonitoringRow) {
    setExecuting(w.key);
    setError(null);
    try {
      const res = await workflowsApi.execute(w.key);
      if (!res.success) {
        throw new Error(res.failureReason || res.error || 'Execution failed');
      }
      setLastTestSummary(
        `${w.name}: OK · run #${res.data?.runId} · n8n #${res.data?.n8nExecutionId || '—'} · ${formatMs(res.data?.durationMs)}`
      );
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Execution failed');
      load();
    } finally {
      setExecuting(null);
    }
  }

  async function runAll() {
    setRunningAll(true);
    setError(null);
    setLastTestSummary(null);
    try {
      const res = await workflowsApi.runAllTests();
      if (!res.success) throw new Error('E2E test request failed');
      const s = res.data.summary;
      setLastTestSummary(
        `E2E: ${s.succeeded}/${s.total} succeeded · ${s.failed} failed (real n8n webhooks)`
      );
      setWorkflows(res.data.workflows || []);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'E2E test failed');
    } finally {
      setRunningAll(false);
    }
  }

  async function queueOne(w: WorkflowMonitoringRow) {
    setExecuting(`queue-${w.key}`);
    try {
      const res = await workflowsApi.queueWorkflow(w.name, { source: 'monitoring-panel', workflowKey: w.key });
      if (!res.success) throw new Error('Queue failed');
      setLastTestSummary(`Queued job ${res.data?.jobId} for ${w.name}`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Queue failed');
    } finally {
      setExecuting(null);
    }
  }

  const totalRuns = workflows.reduce((a, w) => a + w.executionCount, 0);

  return (
    <div className="page-shell-wide animate-fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-zinc-400" />
            Workflows
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Live n8n runtime · refreshes every 10s
            {generatedAt ? ` · ${new Date(generatedAt).toLocaleTimeString()}` : ''}
          </p>
          {n8n && (
            <p className={`text-xs mt-1 ${n8n.reachable ? 'text-green-400' : 'text-red-400'}`}>
              n8n: {n8n.message}
              {runtimeStatus ? ` · platform: ${runtimeStatus}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={runAll} disabled={runningAll || loading}>
            <Zap className="w-4 h-4 mr-1" />
            {runningAll ? 'Running E2E…' : 'Run all (real)'}
          </Button>
        </div>
      </div>

      {lastTestSummary && (
        <div className="rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand">
          {lastTestSummary}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && workflows.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total runs" value={totalRuns} />
          <StatCard
            label="Online"
            value={`${workflows.filter((w) => w.state === 'online').length}/${workflows.length}`}
          />
          <StatCard
            label="Queue waiting"
            value={String((queue as { workflow?: { waiting?: unknown } } | null)?.workflow?.waiting ?? '—')}
          />
          <StatCard
            label="Queue active"
            value={String((queue as { workflow?: { active?: unknown } } | null)?.workflow?.active ?? '—')}
          />
        </div>
      )}

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Workflow runtime</h2>
          {loading && workflows.length === 0 ? (
            <p className="text-gray-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-left">
                  <tr>
                    <th className="pb-2">Workflow</th>
                    <th className="pb-2">State</th>
                    <th className="pb-2">Runs</th>
                    <th className="pb-2">Avg time</th>
                    <th className="pb-2">Last run</th>
                    <th className="pb-2">n8n exec ID</th>
                    <th className="pb-2">Last error</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((w) => (
                    <tr key={w.key} className="border-t border-white/5 align-top">
                      <td className="py-3">
                        <div className="flex items-center gap-2 font-medium">
                          <GitBranch className="w-4 h-4 text-brand shrink-0" />
                          {w.name}
                        </div>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">/{w.webhookPath}</p>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded border text-xs ${workflowStateClass(w.state)}`}
                        >
                          {workflowStateLabel(w.state)}
                        </span>
                        <p className="text-xs text-gray-600 mt-1">
                          {w.successCount} ok · {w.failedCount} fail
                        </p>
                      </td>
                      <td className="py-3">{w.executionCount}</td>
                      <td className="py-3">{formatMs(w.avgRuntimeMs)}</td>
                      <td className="py-3 text-xs text-gray-400 whitespace-nowrap">
                        {w.lastRunAt ? new Date(w.lastRunAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 text-xs font-mono text-gray-400">
                        {w.n8nExecutionId || '—'}
                      </td>
                      <td className="py-3 text-xs text-red-300/90 max-w-[200px] truncate" title={w.failureReason || w.lastError || ''}>
                        {w.failureReason || w.lastError || '—'}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="mr-1"
                          disabled={!!executing || w.state === 'offline'}
                          onClick={() => runOne(w)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!!executing}
                          onClick={() => queueOne(w)}
                        >
                          Q
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Execution log (database)</h2>
          {executions.length === 0 ? (
            <p className="text-gray-500 text-sm">No executions recorded yet. Run a workflow to create real runs.</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 text-left sticky top-0 bg-[#0d1321]">
                  <tr>
                    <th className="pb-2 pr-2">ID</th>
                    <th className="pb-2 pr-2">Workflow</th>
                    <th className="pb-2 pr-2">Status</th>
                    <th className="pb-2 pr-2">Duration</th>
                    <th className="pb-2 pr-2">n8n ID</th>
                    <th className="pb-2 pr-2">Trigger</th>
                    <th className="pb-2 pr-2">Reason</th>
                    <th className="pb-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((ex) => (
                    <tr key={ex.id} className="border-t border-white/5">
                      <td className="py-2 pr-2 font-mono">{ex.id}</td>
                      <td className="py-2 pr-2">{ex.workflowName}</td>
                      <td className="py-2 pr-2">
                        <span
                          className={
                            ex.status === 'completed'
                              ? 'text-green-400'
                              : ex.status === 'failed'
                                ? 'text-red-400'
                                : 'text-gray-400'
                          }
                        >
                          {ex.status}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{formatMs(ex.durationMs)}</td>
                      <td className="py-2 pr-2 font-mono">{ex.n8nExecutionId || '—'}</td>
                      <td className="py-2 pr-2">{ex.triggerSource || '—'}</td>
                      <td className="py-2 pr-2 max-w-[180px] truncate" title={ex.failureReason || ex.errorMessage || ''}>
                        {ex.failureReason || ex.errorMessage || '—'}
                      </td>
                      <td className="py-2 text-gray-500 whitespace-nowrap">
                        {new Date(ex.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
