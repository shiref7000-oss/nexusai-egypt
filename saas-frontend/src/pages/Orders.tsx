/**
 * Incoming orders from external store/ERP webhooks
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const API = '/api/integrations';
const ORDER_STATUSES = [
  'new',
  'pending_confirmation',
  'confirmed',
  'cancelled',
  'shipped',
] as const;
type Tab = 'orders' | 'logs';

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

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [integrationFilter, setIntegrationFilter] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      if (integrationFilter) params.set('integration_id', integrationFilter);

      const logParams = new URLSearchParams({ limit: '60' });
      if (logStatusFilter) logParams.set('status', logStatusFilter);
      if (integrationFilter) logParams.set('integration_id', integrationFilter);

      const [orderRes, logRes, intRes] = await Promise.all([
        fetch(`${API}/orders?${params}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`${API}/incoming-logs?${logParams}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(API, { headers: authHeaders() }).then((r) => r.json()),
      ]);
      if (!orderRes.success) throw new Error(orderRes.error || 'Failed to load orders');
      setOrders(orderRes.data || []);
      setLogs(logRes.data || []);
      setIntegrations(intRes.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, integrationFilter, logStatusFilter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function updateOrderStatus(orderId: string, status: string) {
    const res = await fetch(`${API}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error);
      return;
    }
    await load();
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Orders</h1>
        <p className="text-gray-400 text-sm mt-1">
          Incoming orders from store and ERP webhooks
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {(['orders', 'logs'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm ${
              tab === t ? 'bg-brand/20 text-brand' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'orders' ? 'Incoming orders' : 'Webhook logs'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Integration</label>
          <select
            value={integrationFilter}
            onChange={(e) => setIntegrationFilter(e.target.value)}
            className="min-w-[180px] rounded-md border border-white/10 bg-panel px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {integrations.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        {tab === 'orders' && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-w-[180px] rounded-md border border-white/10 bg-panel px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        )}
        {tab === 'logs' && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Log status</label>
            <select
              value={logStatusFilter}
              onChange={(e) => setLogStatusFilter(e.target.value)}
              className="min-w-[140px] rounded-md border border-white/10 bg-panel px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full" />
        </div>
      ) : tab === 'orders' ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">External ID</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">City</th>
                <th className="text-left p-3">Products</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    No incoming orders yet. Create an integration under Admin → Integrations.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3">{o.integration_name || o.integration_id}</td>
                    <td className="p-3">
                      <Link to={`/orders/${o.id}`} className="text-brand hover:underline font-mono text-xs">
                        {o.external_id}
                      </Link>
                    </td>
                    <td className="p-3">{o.customer?.name}</td>
                    <td className="p-3 font-mono text-xs">{o.customer?.phone}</td>
                    <td className="p-3">{o.customer?.city || '—'}</td>
                    <td className="p-3 max-w-xs truncate">
                      {(o.products || [])
                        .map((p: { name: string; quantity: number }) => `${p.name}×${p.quantity}`)
                        .join(', ')}
                    </td>
                    <td className="p-3">
                      {o.cod_amount} {o.currency}
                    </td>
                    <td className="p-3">
                      <select
                        value={o.status}
                        onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                        className="text-xs rounded bg-black/30 border border-white/10 px-1 py-0.5"
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Integration</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">HTTP</th>
                <th className="text-left p-3">Error</th>
                <th className="text-left p-3">Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No webhook requests logged yet.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-t border-white/5">
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">{l.integration_name}</td>
                    <td className="p-3">
                      <span
                        className={l.status === 'success' ? 'text-green-400' : 'text-red-400'}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3">{l.http_status}</td>
                    <td className="p-3 text-red-300 text-xs max-w-[200px] truncate">
                      {l.error_message ||
                        (l.validation_errors &&
                          (Array.isArray(l.validation_errors)
                            ? l.validation_errors.join('; ')
                            : JSON.stringify(l.validation_errors))) ||
                        '—'}
                    </td>
                    <td className="p-3">
                      <pre className="text-xs text-gray-500 max-w-md overflow-auto max-h-24">
                        {JSON.stringify(l.raw_payload || l.payload_preview, null, 0).slice(0, 280)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
