import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { whatsappApi, type WhatsAppMessage } from '@/lib/whatsappApi';
import { MessageTimeline } from '@/components/whatsapp/MessageTimeline';

const API = '/api/integrations';

const ORDER_STATUSES = [
  'new',
  'pending_confirmation',
  'confirmed',
  'cancelled',
  'shipped',
] as const;

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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    order: Record<string, unknown>;
    status_history: Array<Record<string, unknown>>;
    incoming_logs: Array<Record<string, unknown>>;
    webhook_source: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusNotes, setStatusNotes] = useState('');
  const [waMessages, setWaMessages] = useState<WhatsAppMessage[]>([]);
  const [waResending, setWaResending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/orders/${id}`, { headers: authHeaders() });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load order');
      setData(json.data);
      try {
        const wa = await whatsappApi.orderMessages(id);
        setWaMessages(wa.data.messages || []);
      } catch {
        setWaMessages([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(status: string) {
    if (!id) return;
    const res = await fetch(`${API}/orders/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status, notes: statusNotes || undefined }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error);
      return;
    }
    setStatusNotes('');
    await load();
  }

  if (loading && !data) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data?.order) {
    return (
      <div className="p-8">
        <p className="text-red-300">{error || 'Order not found'}</p>
        <Link to="/orders" className="text-brand text-sm mt-4 inline-block">
          ← Back to orders
        </Link>
      </div>
    );
  }

  const o = data.order;
  const customer = (o.customer || {}) as Record<string, unknown>;
  const products = (o.products || []) as Array<{ name: string; quantity: number; price?: number }>;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link to="/orders" className="text-xs text-gray-500 hover:text-brand">
            ← Orders
          </Link>
          <h1 className="text-2xl font-bold mt-1">Order {String(o.external_id)}</h1>
          <p className="text-sm text-gray-400">
            {String(o.integration_name)} · {statusLabel(String(o.status))}
          </p>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <select
            value={String(o.status)}
            onChange={(e) => updateStatus(e.target.value)}
            className="text-sm rounded-md border border-white/10 bg-panel px-2 py-1.5"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <input
            placeholder="Status note (optional)"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            className="text-sm rounded-md border border-white/10 bg-panel px-2 py-1.5 min-w-[160px]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="font-medium">Customer</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Name</dt>
              <dd>{String(customer.name)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-mono">{String(customer.phone)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">City</dt>
              <dd>{String(customer.city || '—')}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">COD</dt>
              <dd className="font-semibold text-brand">
                {String(o.cod_amount)} {String(o.currency)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="font-medium">Meta</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Integration</dt>
              <dd>{String(o.integration_name)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Source</dt>
              <dd>{data.webhook_source}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Created</dt>
              <dd>{new Date(String(o.created_at)).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Updated</dt>
              <dd>{new Date(String(o.updated_at)).toLocaleString()}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-medium">WhatsApp timeline</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sent · delivered · read · replied · confirmed</p>
          </div>
          <div className="flex gap-2">
            <Link to="/whatsapp" className="text-xs text-brand hover:underline">
              WhatsApp settings
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={waResending || !id}
              onClick={async () => {
                if (!id) return;
                setWaResending(true);
                try {
                  await whatsappApi.resendConfirmation(id);
                  const wa = await whatsappApi.orderMessages(id);
                  setWaMessages(wa.data.messages || []);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'WhatsApp resend failed');
                } finally {
                  setWaResending(false);
                }
              }}
            >
              {waResending ? 'Sending…' : 'Resend COD'}
            </Button>
          </div>
        </div>
        <MessageTimeline messages={waMessages} />
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-medium mb-3">Products</h2>
        <ul className="text-sm divide-y divide-white/5">
          {products.map((p, i) => (
            <li key={i} className="py-2 flex justify-between">
              <span>
                {p.name} × {p.quantity}
              </span>
              {p.price != null && <span className="text-gray-400">{p.price} EGP</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-medium mb-3">Status history</h2>
        {data.status_history.length === 0 ? (
          <p className="text-sm text-gray-500">No status changes recorded</p>
        ) : (
          <ul className="text-sm space-y-2">
            {data.status_history.map((h) => (
              <li key={String(h.id)} className="flex flex-wrap gap-2 text-gray-300">
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  {new Date(String(h.created_at)).toLocaleString()}
                </span>
                <span>
                  {h.from_status ? `${String(h.from_status)} → ` : ''}
                  <strong>{String(h.to_status)}</strong>
                </span>
                <span className="text-gray-500">({String(h.source)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-medium mb-3">Incoming webhook logs</h2>
        {data.incoming_logs.length === 0 ? (
          <p className="text-sm text-gray-500">No logs for this order</p>
        ) : (
          <ul className="text-xs space-y-3">
            {data.incoming_logs.map((log) => (
              <li key={String(log.id)} className="border border-white/5 rounded-lg p-3">
                <p>
                  <span className={log.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                    {String(log.status)}
                  </span>{' '}
                  · HTTP {String(log.http_status)} ·{' '}
                  {new Date(String(log.created_at)).toLocaleString()}
                </p>
                {log.error_message != null && (
                  <p className="text-red-300 mt-1">{String(log.error_message)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-black/30 p-4">
        <h2 className="font-medium mb-3">Raw payload</h2>
        <pre className="text-xs overflow-auto max-h-96 text-gray-300">
          {JSON.stringify(o.raw_payload || {}, null, 2)}
        </pre>
      </section>

      <Button variant="outline" size="sm" onClick={load}>
        Refresh
      </Button>
    </div>
  );
}
