import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2, Brain } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

type Intelligence = Awaited<ReturnType<typeof adminApi.engineeringIntelligence>>['data'];

export default function EngineeringIntelligenceDashboard() {
  const [data, setData] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.engineeringIntelligence(168);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="page-shell flex justify-center py-20 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const m = data?.modelUsage;
  const tasks = data?.taskStatistics;
  const risk = data?.riskOverview;

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        title="Engineering Intelligence"
        description="Model usage, task health, risk bands, lessons learned, and multi-agent activity."
        action={
          <div className="flex gap-2">
            <Link to="/admin/engineering-agent">
              <Button variant="secondary" size="sm">
                Monitor
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="AI calls (7d)" value={m?.calls ?? '—'} tip="Provider API calls in engineering_ai_calls" />
        <MetricCard
          title="Tokens (7d)"
          value={m?.totalTokens != null ? m.totalTokens.toLocaleString() : 'N/A'}
          tip="Sum of provider-reported total_tokens"
        />
        <MetricCard
          title="Cost (7d)"
          value={m?.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(2)}` : 'N/A'}
          tip="Provider-reported cost_usd only"
        />
        <MetricCard title="Avg latency" value={m ? `${m.avgLatencyMs}ms` : '—'} tip="Mean latency_ms per call" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Task statistics" description="Live engineering task counts" />
          <CardBody className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Total" value={tasks?.totalTasks} />
            <Stat label="Running" value={tasks?.runningTasks} />
            <Stat label="Completed" value={tasks?.completedTasks} />
            <Stat label="Failed" value={tasks?.failedTasks} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Risk overview (V3)" description="Deploy gates only — planning never blocked" />
          <CardBody className="space-y-2 text-sm">
            <p title="Average risk_score last 30 days">Avg risk: {risk?.avgRisk ?? 'N/A'}</p>
            <p title="Tasks awaiting deploy approval">Pending deploy approval: {risk?.pendingDeployApprovals ?? 0}</p>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
              <span title="Risk 0–40">Auto: {risk?.bands.auto ?? 0}</span>
              <span title="Risk 41–70">Verify: {risk?.bands.verify ?? 0}</span>
              <span title="Risk 71–90">Deploy approval: {risk?.bands.deployApproval ?? 0}</span>
              <span title="Risk 91+">Admin: {risk?.bands.admin ?? 0}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Model usage by phase" description="understand → decompose → plan → implement → verify" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-1 pr-2" title="Pipeline phase">Phase</th>
                  <th className="text-left py-1 pr-2">Model</th>
                  <th className="text-right py-1 pr-2" title="prompt_tokens">Prompt</th>
                  <th className="text-right py-1 pr-2" title="completion_tokens">Completion</th>
                  <th className="text-right py-1 pr-2" title="total_tokens">Total</th>
                  <th className="text-right py-1" title="original_context_tokens">Orig ctx</th>
                  <th className="text-right py-1" title="compressed_context_tokens">Comp ctx</th>
                </tr>
              </thead>
              <tbody>
                {(m?.byPhase ?? []).map((row) => (
                  <tr key={row.phase} className="border-b border-zinc-800/50">
                    <td className="py-1 pr-2 font-mono">{row.phase}</td>
                    <td className="py-1 pr-2">{row.model ?? '—'}</td>
                    <td className="py-1 pr-2 text-right">{fmt(row.promptTokens)}</td>
                    <td className="py-1 pr-2 text-right">{fmt(row.completionTokens)}</td>
                    <td className="py-1 pr-2 text-right">{fmt(row.totalTokens)}</td>
                    <td className="py-1 pr-2 text-right">{fmt(row.originalContextTokens)}</td>
                    <td className="py-1 text-right">{fmt(row.compressedContextTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Lessons learned" description="Post-task engineering knowledge" />
          <CardBody className="space-y-2 max-h-64 overflow-y-auto text-xs">
            {(data?.learningMemory ?? []).length === 0 && (
              <p className="text-zinc-500">No lessons yet — complete tasks to populate.</p>
            )}
            {(data?.learningMemory ?? []).map((l) => (
              <div key={l.id} className="border-b border-zinc-800/50 pb-2">
                <p className="font-medium text-zinc-300">{l.title}</p>
                {l.whatWorked && <p className="text-emerald-400/80">✓ {l.whatWorked.slice(0, 120)}</p>}
                {l.whatFailed && <p className="text-red-400/80">✗ {l.whatFailed.slice(0, 120)}</p>}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Agent activity" description="PM · Developer · Reviewer · QA" />
          <CardBody className="space-y-1 text-xs">
            {(data?.agentActivity ?? []).map((a) => (
              <p key={`${a.role}-${a.status}`} title={`${a.role} assignments in status ${a.status}`}>
                <span className="font-mono text-zinc-400">{a.role}</span> · {a.status}: {a.count}
              </p>
            ))}
            {(data?.agentActivity ?? []).length === 0 && (
              <p className="text-zinc-500 flex items-center gap-1">
                <Brain className="h-3 w-3" /> Assignments created when pipeline starts.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Cost analytics (daily)" description="Provider-reported cost from telemetry" />
        <CardBody className="text-xs text-zinc-400 space-y-1 max-h-40 overflow-y-auto">
          {(data?.costAnalytics ?? []).map((d) => (
            <p key={d.day}>
              {d.day}: ${d.costUsd.toFixed(4)} · {d.tokens.toLocaleString()} tokens
            </p>
          ))}
          {(data?.costAnalytics ?? []).length === 0 && <p>No cost rows in selected window.</p>}
        </CardBody>
      </Card>
    </div>
  );
}

function fmt(v: number | null | undefined) {
  return v != null ? v.toLocaleString() : 'N/A';
}

function MetricCard({ title, value, tip }: { title: string; value: string | number; tip: string }) {
  return (
    <div className="rounded border border-zinc-800 p-3" title={tip}>
      <p className="text-xs text-zinc-500 border-b border-dotted border-zinc-600 inline-block cursor-help">
        {title}
      </p>
      <p className="text-lg font-medium text-zinc-100 mt-1">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="text-zinc-200">{value ?? '—'}</p>
    </div>
  );
}
