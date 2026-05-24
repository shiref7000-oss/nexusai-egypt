import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';
import { PageHeader, StatCard, Skeleton } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type OpsData = {
  integrations?: {
    integrations: number;
    active_webhooks: number;
    failed_24h: number;
    dead_letter: number;
  };
  workspaces?: { active: number };
  recentUsers?: {
    id: number;
    email: string;
    full_name: string | null;
    role: string;
    plan: string;
    status: string;
    last_login: string | null;
  }[];
  agentActivity?: {
    id: number;
    agent_name: string;
    action: string;
    status: string;
    created_at: string;
    user_email: string;
  }[];
  recentErrors?: {
    id: number;
    agent: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }[];
  queue?: {
    ai?: { waiting?: number; active?: number; failed?: number };
    workflow?: { waiting?: number; active?: number };
    deadLetter?: { count?: number };
  };
  system?: {
    status: string;
    database?: { ok: boolean; latencyMs: number | null };
    redis?: { ok: boolean; status: string };
    workflows?: { failedLast24h: number; running: number };
  };
  httpMetrics?: { totalRequests: number; errors: number; avgDuration: number };
};

type DashStats = {
  users?: { total: number; active: number; inactive: number };
  aiUsage?: {
    totalRequests30d: number;
    monthlyRequests: number;
    failedRequests30d: number;
  };
};

function statusDot(ok: boolean | undefined) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', ok ? 'bg-emerald-400' : 'bg-red-400')}
      aria-hidden
    />
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [ops, setOps] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.dashboard(), adminApi.ops()])
      .then(([dashRes, opsRes]) => {
        const dash = (dashRes as { data?: DashStats }).data ?? dashRes;
        setStats(dash as DashStats);
        setOps((opsRes as { data?: OpsData }).data ?? (opsRes as OpsData));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-shell max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell max-w-6xl mx-auto">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">{error}</div>
      </div>
    );
  }

  const users = stats?.users;
  const ai = stats?.aiUsage;
  const integ = ops?.integrations;
  const queue = ops?.queue;
  const sys = ops?.system;

  return (
    <div className="page-shell max-w-6xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="Ops dashboard"
        description="Live signals from PostgreSQL, queues, and integrations."
        action={
          <Link to="/admin/users" className="text-sm text-zinc-400 hover:text-zinc-200">
            Manage users →
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Users" value={users?.total ?? 0} hint={`${users?.active ?? 0} active`} />
        <StatCard label="Workspaces" value={ops?.workspaces?.active ?? 0} hint="integrations active 30d" />
        <StatCard
          label="AI requests (30d)"
          value={(ai?.totalRequests30d ?? 0).toLocaleString()}
          hint={`${ai?.failedRequests30d ?? 0} failed`}
        />
        <StatCard
          label="API traffic (1h)"
          value={ops?.httpMetrics?.totalRequests ?? 0}
          hint={`${ops?.httpMetrics?.errors ?? 0} errors · ${ops?.httpMetrics?.avgDuration ?? 0}ms avg`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardBody>
            <CardHeader title="System status" />
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">Platform</span>
                <span className="flex items-center gap-2 capitalize">
                  {statusDot(sys?.status === 'healthy')}
                  {sys?.status ?? 'unknown'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">Database</span>
                <span className="flex items-center gap-2">
                  {statusDot(sys?.database?.ok)}
                  {sys?.database?.latencyMs != null ? `${sys.database.latencyMs}ms` : '—'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">Redis</span>
                <span className="flex items-center gap-2 capitalize">
                  {statusDot(sys?.redis?.ok)}
                  {sys?.redis?.status ?? '—'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">Workflows failing (24h)</span>
                <span className="tabular-nums">{sys?.workflows?.failedLast24h ?? 0}</span>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardBody>
            <CardHeader title="Integrations health" />
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-zinc-400">Connected</span>
                <span>{integ?.integrations ?? 0}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Active webhooks</span>
                <span>{integ?.active_webhooks ?? 0}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Failed (24h)</span>
                <span className={cn((integ?.failed_24h ?? 0) > 0 && 'text-amber-400')}>
                  {integ?.failed_24h ?? 0}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Dead letter</span>
                <span className={cn((integ?.dead_letter ?? 0) > 0 && 'text-red-400')}>
                  {integ?.dead_letter ?? 0}
                </span>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardBody>
            <CardHeader title="Queue health" />
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-zinc-400">AI waiting</span>
                <span>{queue?.ai?.waiting ?? '—'}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">AI active</span>
                <span>{queue?.ai?.active ?? '—'}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Workflow waiting</span>
                <span>{queue?.workflow?.waiting ?? '—'}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-400">Dead letter</span>
                <span>{queue?.deadLetter?.count ?? queue?.ai?.failed ?? '—'}</span>
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardBody>
            <CardHeader title="Recent users" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[320px]">
                <thead>
                  <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                    <th className="text-left pb-2 font-medium">User</th>
                    <th className="text-left pb-2 font-medium">Plan</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {(ops?.recentUsers ?? []).map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-2">
                        <p className="truncate max-w-[180px]">{u.email}</p>
                        <p className="text-xs text-zinc-500">{u.role}</p>
                      </td>
                      <td className="py-2 capitalize text-zinc-400">{u.plan}</td>
                      <td className="py-2 capitalize text-zinc-400">{u.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <CardHeader title="Recent errors" description="Failed AI requests (48h)." />
            <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
              {(ops?.recentErrors ?? []).length === 0 ? (
                <li className="text-sm text-zinc-500">No recent failures.</li>
              ) : (
                ops?.recentErrors?.map((e) => (
                  <li key={e.id} className="rounded-lg border border-white/[0.06] px-3 py-2 text-xs">
                    <div className="flex justify-between gap-2 text-zinc-400">
                      <span className="font-medium text-zinc-300">{e.agent}</span>
                      <time>{new Date(e.created_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-1 text-red-300/90 line-clamp-2">{e.error_message || e.status}</p>
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <CardHeader title="Agent activity" description="Latest actions across workspaces." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                  <th className="text-left pb-2 font-medium">Agent</th>
                  <th className="text-left pb-2 font-medium">Action</th>
                  <th className="text-left pb-2 font-medium">User</th>
                  <th className="text-left pb-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {(ops?.agentActivity ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">{a.agent_name}</td>
                    <td className="py-2 text-zinc-400 max-w-[200px] truncate">{a.action}</td>
                    <td className="py-2 text-zinc-500 text-xs">{a.user_email}</td>
                    <td className="py-2 text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
