import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { whatsappApi, type WhatsAppTemplate, type WhatsAppSyncSummary } from '@/lib/whatsappApi';

export function TemplatesPanel({
  templates,
  templateSync,
  connected,
  onRefresh,
  onSyncResult,
}: {
  templates: WhatsAppTemplate[];
  templateSync: { lastSyncedAt: string | null; approved: number; pending: number; rejected: number };
  connected: boolean;
  onRefresh: () => void | Promise<void>;
  onSyncResult?: (payload: {
    templates: WhatsAppTemplate[];
    templateSync: { lastSyncedAt: string | null; approved: number; pending: number; rejected: number };
    connection: import('@/lib/whatsappApi').WhatsAppConnection;
    sync: WhatsAppSyncSummary;
  }) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [metaName, setMetaName] = useState('');

  const groups = {
    approved: templates.filter((t) => t.status === 'approved'),
    pending: templates.filter((t) => t.status === 'pending'),
    rejected: templates.filter((t) => t.status === 'rejected'),
  };

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await whatsappApi.syncTemplates();
      const msg = res.data.sync?.message || 'Templates synced from Meta';
      onSyncResult?.(res.data);
      toast.success(msg);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      setSyncError(msg);
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  }

  async function saveMap(key: string) {
    try {
      await whatsappApi.mapTemplate(key, metaName.trim());
      toast.success('Template mapped');
      setEditing(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function TemplateRow({ t }: { t: WhatsAppTemplate }) {
    return (
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-white">{t.catalog?.label || t.key}</p>
            {t.testOnly && (
              <span className="text-xs text-amber-400/90 mt-0.5 inline-block">
                Test only — not for production sends
              </span>
            )}
            <p className="text-xs text-zinc-500">{t.catalog?.description}</p>
            {t.flow && (
              <span className="text-xs text-zinc-600 mt-1 inline-block">Flow: {t.flow}</span>
            )}
          </div>
          <StatusBadge status={t.metaStatus || t.status} />
        </div>
        {editing === t.key ? (
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white font-mono"
              value={metaName}
              onChange={(e) => setMetaName(e.target.value)}
              placeholder="Meta template name"
            />
            <Button type="button" size="sm" onClick={() => saveMap(t.key)}>
              Save
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="text-xs text-zinc-400">Meta: {t.metaName}</code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!connected}
              onClick={() => {
                setEditing(t.key);
                setMetaName(t.metaName);
              }}
            >
              Map to flow
            </Button>
          </div>
        )}
        {t.rejectionReason && (
          <p className="text-xs text-red-400">{t.rejectionReason}</p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Templates</h2>
          <p className="text-sm text-zinc-500">
            {templateSync.approved} approved · {templateSync.pending} pending · {templateSync.rejected} rejected
            {templateSync.lastSyncedAt && (
              <span className="ml-2">
                · Synced {new Date(templateSync.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={syncing || !connected} onClick={sync}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
          Sync from Meta
        </Button>
      </CardHeader>
      <CardBody className="space-y-6">
        {syncError && (
          <p className="text-xs text-red-400 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2">
            {syncError}
          </p>
        )}
        {(['approved', 'pending', 'rejected'] as const).map((group) =>
          groups[group].length > 0 ? (
            <div key={group}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">{group}</h3>
              <div className="space-y-2">
                {groups[group].map((t) => (
                  <TemplateRow key={t.key} t={t} />
                ))}
              </div>
            </div>
          ) : null
        )}
        {!templates.length && (
          <p className="text-sm text-zinc-500 text-center py-6">Connect WhatsApp to load template catalog.</p>
        )}
      </CardBody>
    </Card>
  );
}
