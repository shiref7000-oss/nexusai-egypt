import { Bot, Package, ShoppingCart, Sparkles, Truck } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

const FLOWS = [
  { id: 'aiAgent', icon: Bot, title: 'AI confirmation agent', desc: 'Draft replies only — never auto-send' },
  { id: 'shipping', icon: Truck, title: 'Shipping notifications', desc: 'Template on shipment.created events' },
  { id: 'abandonedCart', icon: ShoppingCart, title: 'Abandoned checkout recovery', desc: 'Scheduled retention templates' },
  { id: 'aiSales', icon: Sparkles, title: 'AI sales assistant', desc: 'Upsell suggestions via approved templates' },
  { id: 'retention', icon: Package, title: 'Failed delivery alerts', desc: 'Notify when carrier reports failure' },
];

export function FutureFlowsPanel({
  flows,
}: {
  flows: Record<string, { enabled?: boolean; ready?: boolean; note?: string }>;
}) {
  return (
    <Card className="opacity-90">
      <CardHeader>
        <h2 className="text-lg font-semibold text-white">Coming soon</h2>
        <p className="text-sm text-zinc-500">Architecture ready — enable as we ship flows</p>
      </CardHeader>
      <CardBody className="grid sm:grid-cols-2 gap-3">
        {FLOWS.map(({ id, icon: Icon, title, desc }) => {
          const f = flows[id];
          return (
            <div
              key={id}
              className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 relative overflow-hidden"
            >
              <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wider text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                {f?.ready ? 'Ready' : 'Soon'}
              </div>
              <Icon className="h-5 w-5 text-zinc-500 mb-2" />
              <p className="text-sm font-medium text-zinc-300">{title}</p>
              <p className="text-xs text-zinc-600 mt-1">{f?.note || desc}</p>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
