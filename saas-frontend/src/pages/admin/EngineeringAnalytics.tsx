import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

type Period = 'daily' | 'weekly' | 'monthly';
type Analytics = Awaited<ReturnType<typeof adminApi.engineeringAnalytics>>['data'];

export default function EngineeringAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('weekly');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.engineeringAnalytics(period);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period]);

  const m = data?.modelUsage;
  const repair = data?.repair;
  const review = data?.review;
  const qa = data?.qa;

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        title="Engineering Analytics"
        description="Historical cost, tokens, repair attempts, review scores, and QA pass rate."
        action={
          <div className="flex gap-2 items-center">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? 'primary' : 'secondary'}
                onClick={() => setPeriod(p)}
              >
                {p}
              </Button>
            ))}
            <Link to="/admin/engineering-intelligence">
              <Button variant="secondary" size="sm">
                Intelligence
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-16 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="AI calls" value={m?.calls ?? '—'} />
            <Metric
              label="Tokens"
              value={m?.totalTokens != null ? m.totalTokens.toLocaleString() : 'N/A'}
            />
            <Metric
              label="Cost"
              value={m?.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(2)}` : 'N/A'}
            />
            <Metric label="Avg latency" value={m ? `${m.avgLatencyMs}ms` : '—'} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader title="Repair (P3)" />
              <CardBody className="text-sm space-y-1">
                <p>Tasks with repairs: {repair?.tasksWithRepairs ?? 0}</p>
                <p>Total attempts: {repair?.totalAttempts ?? 0}</p>
                <p>Circuit breaker hits: {repair?.circuitBreakerHits ?? 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Review (P0)" />
              <CardBody className="text-sm space-y-1">
                <p>Avg review score: {review?.avgReviewScore ?? 'N/A'}</p>
                <p>Avg security: {review?.avgSecurityScore ?? 'N/A'}</p>
                <p>Security &lt; 80: {review?.securityFails ?? 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="QA (P4)" />
              <CardBody className="text-sm space-y-1">
                <p>Passed: {qa?.passed ?? 0}</p>
                <p>Failed: {qa?.failed ?? 0}</p>
                <p>Pass rate: {qa?.passRate != null ? `${qa.passRate}%` : 'N/A'}</p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Cost by model" />
            <CardBody className="text-xs space-y-1 max-h-48 overflow-y-auto">
              {(data?.modelBreakdown ?? []).map((row) => (
                <p key={row.model}>
                  {row.model}: ${row.costUsd.toFixed(4)} · {row.tokens.toLocaleString()} tokens ·{' '}
                  {row.calls} calls
                </p>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Task trends" />
            <CardBody className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {(data?.trends?.tasks ?? []).map((t) => (
                <p key={t.bucket}>
                  {String(t.bucket).slice(0, 10)}: {t.completed} ok / {t.failed} fail / {t.blocked}{' '}
                  blocked
                </p>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Token & cost trends" />
            <CardBody className="grid md:grid-cols-2 gap-4 text-xs max-h-40 overflow-y-auto">
              <div>
                {(data?.trends?.cost ?? []).map((c) => (
                  <p key={c.bucket}>
                    {String(c.bucket).slice(0, 10)}: ${c.costUsd.toFixed(4)}
                  </p>
                ))}
              </div>
              <div>
                {(data?.trends?.tokens ?? []).map((t) => (
                  <p key={t.bucket}>
                    {String(t.bucket).slice(0, 10)}: {t.tokens.toLocaleString()} tokens
                  </p>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-zinc-800 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg text-zinc-100">{value}</p>
    </div>
  );
}
