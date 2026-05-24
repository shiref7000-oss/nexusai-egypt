import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, FlaskConical, Package, Plug, Store } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { PageHeader, StatCard, Skeleton, EmptyState } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { getOnboardingFocus } from '@/lib/onboarding';

const API = '/api/integrations';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('nexusai_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}

const quickLinks = [
  { label: 'AI Agents', to: '/agents', icon: Bot, desc: 'Chat with your team' },
  { label: 'Playground', to: '/playground', icon: FlaskConical, desc: 'Test prompts' },
  { label: 'Marketplace', to: '/marketplace', icon: Store, desc: 'Discover agents' },
  { label: 'Integrations', to: '/admin/integrations', icon: Plug, desc: 'Connect stores' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<{ monthlyUsed?: number; monthlyLimit?: number } | null>(null);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const impersonator = localStorage.getItem('nexusai_impersonator');

  useEffect(() => {
    Promise.all([
      apiFetch<{ success: boolean; data: { usage?: { monthlyUsed: number; monthlyLimit: number } } }>(
        '/api/auth/me'
      )
        .then((r) => setUsage(r.data.usage || null))
        .catch(() => setUsage(null)),
      fetch(`${API}/dashboard`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((j) => {
          if (j.success) setDashboard(j.data);
        })
        .catch(() => setDashboard(null)),
    ]).finally(() => setLoading(false));
  }, []);

  const returnToAdmin = () => {
    const t = localStorage.getItem('nexusai_impersonator');
    if (!t) return;
    localStorage.setItem('nexusai_token', t);
    localStorage.removeItem('nexusai_impersonator');
    window.location.assign('/admin/users');
  };

  const latest = (dashboard?.latest_orders || []) as Array<Record<string, unknown>>;
  const focus = getOnboardingFocus();
  const focusHint =
    focus === 'orders'
      ? 'Start with Integrations and Orders — your incoming pipeline is ready.'
      : focus === 'support'
        ? 'Open AI Agents to test Arabic customer replies.'
        : focus === 'growth'
          ? 'Explore Marketplace and Playground for creative agents.'
          : null;

  return (
    <div className="page-shell animate-fade-in">
      {focusHint && (
        <div className="mb-8 rounded-2xl border border-white/[0.08] bg-elevated/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-zinc-400">{focusHint}</p>
          <Link to={focus === 'orders' ? '/admin/integrations' : focus === 'support' ? '/agents' : '/playground'}>
            <Button variant="secondary" size="sm">
              Continue
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}
      {impersonator && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-amber-200/90">Viewing as {user?.email}</span>
          <Button size="sm" variant="outline" onClick={returnToAdmin}>
            Return to admin
          </Button>
        </div>
      )}

      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Here's what's happening today.`}
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : dashboard ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Incoming today" value={String(dashboard.incoming_today ?? 0)} />
          <StatCard label="Confirmed" value={String(dashboard.total_confirmed ?? 0)} />
          <StatCard
            label="Failed webhooks"
            value={String(dashboard.failed_webhooks_today ?? 0)}
            hint="Today"
          />
          <StatCard label="Integrations" value={String(dashboard.active_integrations ?? 0)} hint="Active" />
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Workspace</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map(({ label, to, icon: Icon, desc }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-xl border border-white/[0.06] bg-panel p-4 shadow-soft transition-colors hover:border-white/[0.1] hover:bg-elevated/80"
            >
              <Icon className="mb-3 h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-200" />
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 flex flex-wrap gap-3">
        <Link to="/orders">
          <Button variant="secondary" size="sm">
            <Package className="mr-2 h-4 w-4" />
            All orders
            <ArrowRight className="ml-2 h-3.5 w-3.5 opacity-50" />
          </Button>
        </Link>
      </section>

      {usage && (
        <Card className="mt-10 max-w-md" variant="elevated">
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">AI usage</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
              {usage.monthlyUsed} <span className="text-zinc-500 font-normal">/ {usage.monthlyLimit}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500 capitalize">Plan: {user?.plan || 'free'}</p>
          </CardBody>
        </Card>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Recent orders
        </h2>
        {loading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : latest.length > 0 ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs text-zinc-500">
                    <th className="px-5 py-3 font-medium">Order</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">COD</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((o) => (
                    <tr key={String(o.id)} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-5 py-3">
                        <Link
                          to={`/orders/${o.id}`}
                          className="font-mono text-xs text-zinc-300 hover:text-foreground"
                        >
                          {String(o.external_id)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-zinc-300">
                        {(o.customer as { name?: string })?.name || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-md border border-white/[0.08] bg-elevated px-2 py-0.5 text-xs text-zinc-400">
                          {statusLabel(String(o.status))}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-zinc-400">
                        {String(o.cod_amount)} {String(o.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No orders yet"
            description="Incoming orders from your integrations will appear here."
            action={
              <Link to="/admin/integrations">
                <Button variant="secondary" size="sm">
                  Set up integrations
                </Button>
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
