import { Link } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import type { WhatsAppActivity } from '@/lib/whatsappApi';

export function ActivityPanel({ activity }: { activity: WhatsAppActivity[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-white">Recent activity</h2>
        <p className="text-sm text-zinc-500">Latest inbound and outbound messages</p>
      </CardHeader>
      <CardBody>
        {!activity.length ? (
          <p className="text-sm text-zinc-500 text-center py-8">No messages yet. Send a test or receive an order.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Dir</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Preview</th>
                  <th className="pb-2 pr-4">Error</th>
                  <th className="pb-2">Order</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-800/60">
                    <td className="py-2 pr-4 text-zinc-500 whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 capitalize">{a.direction}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="py-2 pr-4 text-zinc-300 max-w-[200px] truncate">{a.bodyPreview}</td>
                    <td className="py-2 pr-4 text-red-400/90 max-w-[220px] truncate text-xs" title={a.errorMessage || undefined}>
                      {a.status === 'failed' && a.errorMessage ? a.errorMessage : '—'}
                    </td>
                    <td className="py-2">
                      {a.orderId ? (
                        <Link to={`/orders/${a.orderId}`} className="text-brand hover:underline text-xs">
                          {a.orderExternalId || 'View'}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
