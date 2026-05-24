import { useEffect, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { adminApi } from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';

type PlanRow = {
  id: number;
  slug: string;
  name: string;
  price_usd_monthly: number;
  monthly_requests: number;
  is_active: boolean;
  features?: unknown;
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .plans()
      .then((res) => setPlans((res as { data: PlanRow[] }).data ?? []))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-shell max-w-4xl mx-auto space-y-6 pb-10">
      <Toaster position="top-center" richColors />
      <PageHeader
        title="Plans & pricing"
        description="Active plans from the database — changes via SQL or admin API extensions."
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Loading plans…</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{plan.name}</h3>
                  <span className="text-xs text-zinc-500 font-mono">{plan.slug}</span>
                </div>
                <p className="text-xl font-medium mt-2 tabular-nums">
                  {Number(plan.price_usd_monthly) > 0 ? `$${plan.price_usd_monthly}/mo` : 'Free'}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {Number(plan.monthly_requests).toLocaleString()} requests / month
                </p>
                {!plan.is_active && (
                  <p className="text-xs text-amber-400 mt-2">Inactive</p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
