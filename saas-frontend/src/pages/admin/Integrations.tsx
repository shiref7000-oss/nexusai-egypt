/**
 * Admin Integrations — live PostgreSQL + runtime webhook data only
 */
import { useCallback, useEffect, useState } from 'react';
import { integrationsApi } from '@/lib/integrationsApi';

type Tab = 'integrations' | 'incoming-logs';

async function copyText(text: string, label: string, setCopied: (v: string | null) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  } catch {
    setCopied('Copy failed — select and copy manually');
    setTimeout(() => setCopied(null), 3000);
  }
}

export default function AdminIntegrations() {
  const [tab, setTab] = useState<Tab>('integrations');
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [incomingLogs, setIncomingLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createdIncomingUrl, setCreatedIncomingUrl] = useState<string | null>(null);
  const [createdIncomingSecret, setCreatedIncomingSecret] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    integrationId: number;
    ok: boolean;
    message: string;
    detail?: unknown;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, list, logRes] = await Promise.all([
        integrationsApi.stats(),
        integrationsApi.list(),
        integrationsApi.incomingLogs(50),
      ]);
      setStats(s.data);
      setIntegrations(list.data ?? []);
      setIncomingLogs(logRes.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load integrations');
      setStats(null);
      setIntegrations([]);
      setIncomingLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function createIntegration() {
    if (!newName.trim()) return;
    try {
      const json = await integrationsApi.create(newName.trim());
      setNewName('');
      setSelectedId(json.data.id);
      setCreatedIncomingUrl(json.data.incoming_webhook_url ?? null);
      setCreatedIncomingSecret(json.data.incoming_secret ?? null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function toggleIntegration(id: number, enabled: boolean) {
    await integrationsApi.patch(id, { enabled });
    await load();
  }

  async function renameIntegration(id: number) {
    if (!renameValue.trim()) return;
    try {
      await integrationsApi.patch(id, { name: renameValue.trim() });
      setRenamingId(null);
      setRenameValue('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    }
  }

  async function deleteIntegration(id: number, name: string, force = false) {
    try {
      await integrationsApi.delete(id, force);
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (e: unknown) {
      const res = e as Error & { status?: number; body?: { code?: string; data?: { order_count?: number } } };
      if (!force && res.body?.code === 'ORDERS_EXIST') {
        const count = res.body.data?.order_count ?? '?';
        const ok = window.confirm(
          `"${name}" has ${count} order(s). Delete integration and all related data? This cannot be undone.`
        );
        if (ok) await deleteIntegration(id, name, true);
        return;
      }
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function sendTestOrder(id: number) {
    setTestingId(id);
    setTestResult(null);
    setError(null);
    try {
      const json = await integrationsApi.testIncomingOrder(id);
      setTestResult({
        integrationId: id,
        ok: true,
        message: `Live webhook test OK — order ${(json.data?.order as { external_id?: string })?.external_id ?? 'created'}`,
        detail: json.data,
      });
      await load();
    } catch (e: unknown) {
      setTestResult({
        integrationId: id,
        ok: false,
        message: e instanceof Error ? e.message : 'Test failed',
      });
    } finally {
      setTestingId(null);
    }
  }

  async function regenerateSecret(id: number) {
    try {
      const json = await integrationsApi.regenerateSecret(id);
      setSelectedId(id);
      setCreatedIncomingUrl(json.data.incoming_webhook_url ?? null);
      setCreatedIncomingSecret(json.data.incoming_secret ?? null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rotate secret failed');
    }
  }

  if (loading && !stats) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  const orderStats = stats?.orders || {};
  const incoming24 = stats?.incoming_webhooks_24h || {};

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-gray-400 text-sm">
          Live integration data from PostgreSQL. Webhook URLs call production{' '}
          <code className="text-brand">/api/public/orders</code>.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {copiedLabel && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-green-200 text-sm">
          {copiedLabel}
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10 pb-2">
        {(
          [
            ['integrations', 'Integrations'],
            ['incoming-logs', 'Incoming webhook logs'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === id ? 'bg-brand text-black' : 'text-gray-400 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Integrations', stats.integrations],
            ['Orders', orderStats.total ?? 0],
            ['Webhooks OK (24h)', incoming24.success ?? 0],
            ['Webhooks failed (24h)', incoming24.failed ?? 0],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-semibold text-brand">{val ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'integrations' && (
        <>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="font-medium">Create integration</h2>
            <p className="text-xs text-gray-500">
              Each integration gets a unique webhook URL and bearer secret.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="flex-1 min-w-[200px] rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
                placeholder="Integration name (e.g. Shopify Egypt)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-brand text-black text-sm font-medium"
                onClick={createIntegration}
              >
                Create
              </button>
            </div>
            {createdIncomingUrl && createdIncomingSecret && (
              <div className="space-y-2 text-xs border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                <p className="text-amber-400 font-medium">Save these credentials now (shown once):</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-gray-500">Webhook URL</span>
                  <button
                    type="button"
                    className="text-xs px-2 py-0.5 rounded bg-white/10"
                    onClick={() => copyText(createdIncomingUrl, 'Webhook URL copied', setCopiedLabel)}
                  >
                    Copy URL
                  </button>
                </div>
                <p className="break-all text-gray-300 font-mono">{createdIncomingUrl}</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-gray-500">Bearer token</span>
                  <button
                    type="button"
                    className="text-xs px-2 py-0.5 rounded bg-white/10"
                    onClick={() =>
                      copyText(createdIncomingSecret, 'Bearer token copied', setCopiedLabel)
                    }
                  >
                    Copy token
                  </button>
                </div>
                <p className="break-all text-gray-300 font-mono">{createdIncomingSecret}</p>
                <p className="text-gray-500">
                  Use header: Authorization: Bearer &lt;token&gt; or X-Nexus-Secret
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-medium">Your integrations</div>
            <ul className="divide-y divide-white/5">
              {integrations.length === 0 && (
                <li className="px-4 py-6 text-gray-500 text-sm">No integrations yet</li>
              )}
              {integrations.map((i) => (
                <li
                  key={i.id}
                  className={`px-4 py-4 space-y-2 ${selectedId === i.id ? 'bg-white/5' : ''}`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="text-left flex-1 min-w-0">
                      {renamingId === i.id ? (
                        <div className="flex gap-2 flex-wrap">
                          <input
                            className="rounded bg-black/30 border border-white/10 px-2 py-1 text-sm"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                          />
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-brand text-black"
                            onClick={() => renameIntegration(i.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-white/10"
                            onClick={() => setRenamingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="text-left" onClick={() => setSelectedId(i.id)}>
                          <p className="font-medium">{i.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            ID {i.id} · {i.enabled ? 'Active' : 'Inactive'}
                          </p>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded bg-white/10"
                        onClick={() => {
                          setRenamingId(i.id);
                          setRenameValue(i.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={!i.enabled || testingId === i.id}
                        className="text-xs px-2 py-1 rounded bg-brand/20 text-brand disabled:opacity-50"
                        onClick={() => sendTestOrder(i.id)}
                      >
                        {testingId === i.id ? 'Sending…' : 'Live webhook test'}
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded bg-white/10"
                        onClick={() => toggleIntegration(i.id, !i.enabled)}
                      >
                        {i.enabled ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded bg-white/10"
                        onClick={() => regenerateSecret(i.id)}
                      >
                        Rotate secret
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300"
                        onClick={() => deleteIntegration(i.id, i.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {i.incoming_webhook_url && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <p className="text-xs text-gray-400 break-all font-mono flex-1">
                        {i.incoming_webhook_url}
                      </p>
                      <button
                        type="button"
                        className="text-xs px-2 py-0.5 rounded bg-white/10 shrink-0"
                        onClick={() =>
                          copyText(i.incoming_webhook_url, 'Webhook URL copied', setCopiedLabel)
                        }
                      >
                        Copy URL
                      </button>
                    </div>
                  )}
                  {selectedId === i.id &&
                    createdIncomingSecret &&
                    createdIncomingUrl &&
                    createdIncomingUrl.includes(String(i.id)) && (
                      <div className="text-xs text-amber-400/90">
                        New secret available above — copy before leaving this page.
                      </div>
                    )}
                  {testResult?.integrationId === i.id && (() => {
                    const result = testResult;
                    if (!result) return null;
                    return (
                      <div
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          result.ok
                            ? 'border-green-500/30 bg-green-500/10 text-green-200'
                            : 'border-red-500/30 bg-red-500/10 text-red-200'
                        }`}
                      >
                        <p className="font-medium">{result.ok ? 'Test succeeded' : 'Test failed'}</p>
                        <p className="mt-1 opacity-90">{result.message}</p>
                      </div>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </div>

        </>
      )}

      {tab === 'incoming-logs' && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 font-medium">
            Incoming webhook requests
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/5">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Integration</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">HTTP</th>
                  <th className="px-4 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {incomingLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-gray-500 text-center">
                      No webhook traffic yet
                    </td>
                  </tr>
                )}
                {incomingLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/5">
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{log.integration_name}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          log.status === 'success' ? 'text-green-400' : 'text-red-400'
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{log.http_status}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 max-w-md">
                      <pre className="overflow-auto max-h-20">
                        {log.error_message ||
                          (log.validation_errors && JSON.stringify(log.validation_errors)) ||
                          JSON.stringify(log.raw_payload || log.payload_preview).slice(0, 200)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
