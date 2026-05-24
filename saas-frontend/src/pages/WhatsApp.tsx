import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  MessageCircle,
  RefreshCw,
  Unlink,
  Settings2,
  LayoutDashboard,
  FileText,
  Zap,
  Activity,
  Inbox,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { whatsappApi, type WhatsAppStatusPayload } from '@/lib/whatsappApi';
import { PageHeader, StatCard } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConnectionWizard } from '@/components/whatsapp/ConnectionWizard';
import { TemplatesPanel } from '@/components/whatsapp/TemplatesPanel';
import { CodSettingsPanel } from '@/components/whatsapp/CodSettingsPanel';
import { ActivityPanel } from '@/components/whatsapp/ActivityPanel';
import { ConversationsInbox } from '@/components/whatsapp/ConversationsInbox';
import { TestMessagePanel } from '@/components/whatsapp/TestMessagePanel';
import { WebhookSetupPanel } from '@/components/whatsapp/WebhookSetupPanel';
import { FutureFlowsPanel } from '@/components/whatsapp/FutureFlowsPanel';
import { StatusBadge } from '@/components/whatsapp/StatusBadge';
import { StatSkeletonRow, CardSkeleton } from '@/components/whatsapp/SkeletonBlocks';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'inbox' | 'setup' | 'templates' | 'cod' | 'activity';

const TABS: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'setup', label: 'Connection', icon: Settings2 },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'cod', label: 'COD', icon: Zap },
  { id: 'activity', label: 'Activity', icon: Activity },
];

export default function WhatsAppPage() {
  const [data, setData] = useState<WhatsAppStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      const res = await whatsappApi.status();
      setData(res.data);
      if (!opts?.silent) setRefreshStatus('idle');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load WhatsApp';
      setError(msg);
      if (!opts?.silent) toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onWorkspace = () => {
      setLoading(true);
      load();
    };
    window.addEventListener('nexusai-workspace-changed', onWorkspace);
    return () => window.removeEventListener('nexusai-workspace-changed', onWorkspace);
  }, [load]);

  const conn = data?.connection;
  const connected = !!conn?.connected;

  const refreshFromMeta = useCallback(async () => {
    setRefreshing(true);
    setRefreshStatus('idle');
    setRefreshMessage('Fetching templates and phone profile from Meta…');
    setError(null);
    try {
      if (connected) {
        const res = await whatsappApi.syncFromMeta();
        setData(res.data);
        const msg = res.data.sync?.message || 'Synced from Meta';
        setRefreshStatus('success');
        setRefreshMessage(msg);
        toast.success(msg);
      } else {
        const res = await whatsappApi.status();
        setData(res.data);
        setRefreshStatus('success');
        setRefreshMessage('Status loaded');
        toast.success('Refreshed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Refresh failed';
      setRefreshStatus('error');
      setRefreshMessage(msg);
      setError(msg);
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  }, [connected]);
  const analytics = data?.analytics;

  useEffect(() => {
    if (!loading && !connected && tab === 'overview') setTab('setup');
  }, [loading, connected, tab]);

  async function handleDisconnect() {
    if (!confirm('Disconnect WhatsApp?')) return;
    try {
      await whatsappApi.disconnect();
      toast.success('Disconnected');
      setLoading(true);
      await load();
      setTab('setup');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  if (loading && !data) {
    return (
      <div className="admin-page-shell space-y-6">
        <div className="h-10 w-48 bg-zinc-800 rounded animate-pulse" />
        <StatSkeletonRow />
        <div className="grid lg:grid-cols-2 gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <PageHeader
        title="WhatsApp"
        description="Cloud API for COD confirmations, delivery updates, and customer messaging — multi-tenant, queue-backed, production-ready."
        action={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={refreshFromMeta}
              disabled={refreshing || (loading && !data)}
              aria-busy={refreshing}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', refreshing && 'animate-spin')} />
              {refreshing ? 'Syncing…' : 'Refresh'}
            </Button>
            {connected && (
              <Button type="button" variant="secondary" size="sm" onClick={handleDisconnect}>
                <Unlink className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            )}
          </div>
        }
      />

      {(refreshing || refreshMessage) && (
        <p
          role="status"
          className={cn(
            'mb-4 text-xs rounded-lg px-3 py-2 border flex items-start gap-2',
            refreshStatus === 'success' && 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50',
            refreshStatus === 'error' && 'text-red-300 bg-red-950/40 border-red-800/50',
            (refreshing || refreshStatus === 'idle') && 'text-zinc-400 bg-zinc-900 border-zinc-800'
          )}
        >
          {refreshStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          {refreshStatus === 'success' && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          {refreshing && <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />}
          {refreshMessage}
        </p>
      )}

      {error && !data && (
        <Card className="mb-6 border-red-500/30">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-300">{error}</p>
            <Button type="button" size="sm" onClick={() => { setLoading(true); load(); }}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {!connected && data && (
        <div className="mb-8 rounded-xl border border-brand/30 bg-brand/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <MessageCircle className="h-10 w-10 text-brand shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-white">Connect WhatsApp to go live</h2>
              <p className="text-sm text-zinc-400 mt-1 max-w-xl">
                Add your Meta Cloud API credentials, verify webhooks, approve templates — then COD confirmations
                send automatically on every new order.
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => setTab('setup')}>
            Start setup
          </Button>
        </div>
      )}

      {connected && data && (
        <div className="mb-6 flex flex-wrap items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <StatusBadge status="connected" />
          <span className="text-sm text-white font-medium">{conn?.displayPhone || 'WhatsApp'}</span>
          <span className="text-xs text-zinc-500 font-mono">WABA {conn?.wabaId}</span>
          <StatusBadge status={conn?.webhookVerified ? 'approved' : 'pending'} />
          <span className="text-xs text-zinc-500">
            {conn?.webhookVerified ? 'Webhook verified' : 'Webhook pending verification in Meta'}
          </span>
          <StatusBadge status={data.queue.status} />
          <span className="text-xs text-zinc-500">
            Queue: {data.queue.waiting} waiting · {data.queue.active} active
          </span>
          {data.worker && (
            <StatusBadge status={data.worker.workerReachable ? 'approved' : 'failed'} />
          )}
          {data.worker && !data.worker.workerReachable && (
            <span className="text-xs text-amber-400">Worker offline — outbound messages will not send</span>
          )}
        </div>
      )}

      <nav className="flex flex-wrap gap-1 mb-6 border-b border-zinc-800 pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-md border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-brand text-white bg-zinc-900/50'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Sent today" value={analytics?.today.sent ?? 0} />
            <StatCard label="Delivery %" value={`${analytics?.period30d.deliveryPct ?? 0}%`} hint="30 days" />
            <StatCard label="Read %" value={`${analytics?.period30d.readPct ?? 0}%`} hint="30 days" />
            <StatCard label="Confirm %" value={`${analytics?.period30d.confirmationPct ?? 0}%`} hint="30 days inbound" />
            <StatCard label="Failed %" value={`${analytics?.period30d.failedPct ?? 0}%`} hint="30 days" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Sent (30d)" value={data.stats.sent} />
            <StatCard label="Delivered" value={data.stats.delivered} />
            <StatCard label="Read" value={data.stats.read} />
            <StatCard label="Confirmed" value={data.stats.confirmed} />
            <StatCard label="Failed" value={data.stats.failed} />
          </div>

          {data.analytics.topTemplates.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="text-sm font-medium text-zinc-400 mb-3">Top templates (30d)</h3>
                <div className="flex flex-wrap gap-2">
                  {data.analytics.topTemplates.map((t) => (
                    <span key={t.key} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">
                      {t.key}: {t.count}
                    </span>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {connected && data && (
            <WebhookSetupPanel
              webhookUrl={data.webhookUrl}
              webhookVerified={!!conn?.webhookVerified}
              connected={connected}
              onUpdated={() => load({ silent: true })}
            />
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <TestMessagePanel
              templates={data.templates}
              connected={connected}
              workerReachable={data.worker?.workerReachable ?? true}
              onSent={() => load({ silent: true })}
            />
            <Card>
              <CardBody>
                <h3 className="font-medium text-white mb-2">Template sync</h3>
                <p className="text-sm text-zinc-500">
                  {data.templateSync.approved} approved · {data.templateSync.pending} pending
                  {data.templateSync.lastSyncedAt &&
                    ` · Last sync ${new Date(data.templateSync.lastSyncedAt).toLocaleString()}`}
                </p>
              </CardBody>
            </Card>
          </div>

          <ActivityPanel activity={data.activity} />
          <FutureFlowsPanel flows={data.flows} />
        </div>
      )}

      {tab === 'setup' && (
        <div className="max-w-2xl">
          {data ? (
            <ConnectionWizard
              webhookUrl={data.webhookUrl}
              onConnected={() => {
                setLoading(true);
                load();
                setTab('overview');
              }}
              initialMetaAppId={conn?.metaAppId}
            />
          ) : (
            <CardSkeleton lines={6} />
          )}
        </div>
      )}

      {tab === 'templates' && data && (
        <TemplatesPanel
          templates={data.templates}
          templateSync={data.templateSync}
          connected={connected}
          onRefresh={refreshFromMeta}
          onSyncResult={(partial) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    templates: partial.templates,
                    templateSync: { ...prev.templateSync, ...partial.templateSync, total: partial.templates.length },
                    connection: partial.connection,
                    sync: partial.sync,
                  }
                : prev
            );
            setRefreshStatus('success');
            setRefreshMessage(partial.sync?.message || 'Templates synced');
          }}
        />
      )}

      {tab === 'cod' && data && (
        <CodSettingsPanel
          settings={data.settings}
          templates={data.templates}
          connected={connected}
          codReady={!!data.flows.cod?.ready}
          onSaved={load}
        />
      )}

      {tab === 'inbox' && <ConversationsInbox connected={connected} />}

      {tab === 'activity' && data && <ActivityPanel activity={data.activity} />}

      {error && data && (
        <p className="mt-4 text-xs text-amber-500/90">Partial data shown — {error}</p>
      )}
    </div>
  );
}
