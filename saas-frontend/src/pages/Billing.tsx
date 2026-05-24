import { useEffect, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { PageHeader, StatCard } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { accountApi, type BillingData } from '@/lib/accountApi';
import { cn } from '@/lib/utils';

function formatPeriod(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accountApi
      .billing()
      .then((res) => setData(res.data))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load billing'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-shell max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-40 rounded-lg bg-white/[0.06] animate-pulse" />
        <div className="grid sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-shell max-w-5xl mx-auto">
        <p className="text-sm text-zinc-500">Billing unavailable. Try again later.</p>
      </div>
    );
  }

  const { currentPlan, usage, limits, paymentMethod, invoices, plans } = data;
  const isFree = currentPlan.slug === 'free';

  return (
    <div className="page-shell max-w-5xl mx-auto space-y-8 pb-10">
      <Toaster position="top-center" richColors />
      <PageHeader
        title="Billing"
        description="Plan, usage, and invoices for your workspace."
        action={
          <Button type="button" variant="secondary" asChild>
            <a href="mailto:support@nexus-ai.group?subject=Plan%20change">Contact sales</a>
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Current plan" value={currentPlan.name} hint={currentPlan.status} />
        <StatCard
          label="Monthly usage"
          value={`${usage.monthlyUsed.toLocaleString()} / ${usage.monthlyLimit.toLocaleString()}`}
          hint={`${usage.percentUsed}% of limit`}
        />
        <StatCard
          label="Price"
          value={currentPlan.priceUsdMonthly > 0 ? `$${currentPlan.priceUsdMonthly}/mo` : 'Free'}
        />
        <StatCard label="Agents allowed" value={limits.agents} hint={`${limits.workflows} workflows`} />
      </div>

      <Card>
        <CardBody>
          <CardHeader title="Usage" description="Request volume this billing period." />
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                usage.percentUsed >= 90 ? 'bg-red-500/80' : usage.percentUsed >= 70 ? 'bg-amber-500/80' : 'bg-emerald-500/80'
              )}
              style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {usage.monthlyLimit - usage.monthlyUsed > 0
              ? `${(usage.monthlyLimit - usage.monthlyUsed).toLocaleString()} requests remaining`
              : 'At monthly limit — upgrade or wait for reset'}
          </p>
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardBody>
            <CardHeader title="Payment method" />
            {paymentMethod ? (
              <p className="text-sm text-zinc-300">
                {paymentMethod.brand} ···· {paymentMethod.last4} · exp {paymentMethod.exp}
              </p>
            ) : (
              <p className="text-sm text-zinc-500">No card on file. Invoiced plans use manual billing.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <CardHeader title="Limits overview" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-500 text-xs">AI requests / mo</dt>
                <dd className="font-medium tabular-nums">{limits.monthlyRequests.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs">Integrations</dt>
                <dd className="font-medium">{limits.integrations}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs">Agents</dt>
                <dd className="font-medium">{limits.agents}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs">Workflows</dt>
                <dd className="font-medium">{limits.workflows}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <CardHeader title="Invoices" description="Recent billing periods from usage records." />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-white/[0.06]">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Requests</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5">{formatPeriod(inv.period)}</td>
                    <td className="py-2.5 tabular-nums text-zinc-400">{inv.requests.toLocaleString()}</td>
                    <td className="py-2.5 tabular-nums">
                      {inv.amountUsd > 0 ? `$${inv.amountUsd.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 capitalize text-zinc-400">{inv.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-4">Plans</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const active = plan.slug === currentPlan.slug;
            return (
              <Card key={plan.slug} className={active ? 'border-emerald-500/30 bg-emerald-500/5' : ''}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {active && <span className="text-[10px] uppercase tracking-wide text-emerald-400">Current</span>}
                  </div>
                  <p className="text-lg font-medium mt-1 tabular-nums">
                    {plan.priceUsdMonthly > 0 ? `$${plan.priceUsdMonthly}/mo` : 'Free'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {plan.monthlyRequests.toLocaleString()} requests / month
                  </p>
                  {!active && (
                    <Button type="button" className="mt-4 w-full" variant={isFree ? 'default' : 'secondary'} asChild>
                      <a href={`mailto:support@nexus-ai.group?subject=Upgrade%20to%20${plan.name}`}>
                        {plan.priceUsdMonthly > (currentPlan.priceUsdMonthly || 0) ? 'Upgrade' : 'Downgrade'}
                      </a>
                    </Button>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
