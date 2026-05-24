import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { whatsappApi, type WhatsAppSettings, type WhatsAppTemplate } from '@/lib/whatsappApi';

export function CodSettingsPanel({
  settings,
  templates,
  connected,
  codReady,
  onSaved,
}: {
  settings: WhatsAppSettings;
  templates: WhatsAppTemplate[];
  connected: boolean;
  codReady: boolean;
  onSaved: () => void;
}) {
  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const codTemplates = templates.filter(
    (t) =>
      !t.testOnly &&
      t.sendAllowed !== false &&
      (t.key === 'cod_confirmation' || (t.flow === 'cod' && t.catalog?.sampleBody?.includes('{{3}}')))
  );
  const approvedCodTemplates = codTemplates.filter((t) => t.status === 'approved');
  const codTemplateInvalid =
    local.codTemplateKey !== 'cod_confirmation' &&
    !codTemplates.some((t) => t.key === local.codTemplateKey);

  async function save() {
    setSaving(true);
    try {
      await whatsappApi.updateSettings(local);
      toast.success('COD settings saved');
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function resendFailed() {
    setResending(true);
    try {
      const res = await whatsappApi.resendFailed();
      toast.success(`Queued ${res.data.queued} resends`);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-white">COD confirmations</h2>
        <p className="text-sm text-zinc-500">
          Auto-send on new orders via queue — {codReady ? 'ready' : 'waiting for approved template'}
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white">Enable COD confirmations</p>
            <p className="text-xs text-zinc-500">Queues template message when orders arrive</p>
          </div>
          <Switch
            checked={local.codEnabled}
            disabled={!connected}
            onCheckedChange={(v) => setLocal((s) => ({ ...s, codEnabled: v }))}
          />
        </div>

        <label className="block text-sm">
          <span className="text-zinc-400">Template</span>
          <select
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
            value={local.codTemplateKey}
            disabled={!connected}
            onChange={(e) => setLocal((s) => ({ ...s, codTemplateKey: e.target.value }))}
          >
            {codTemplates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.catalog?.label || t.key} ({t.status})
              </option>
            ))}
          </select>
          {codTemplateInvalid && (
            <p className="mt-1 text-xs text-amber-400/90">
              Current template is not valid for COD (needs 3 variables). Choose cod_confirmation and save.
            </p>
          )}
        </label>

        <label className="block text-sm">
          <span className="text-zinc-400">Delay before send (seconds)</span>
          <input
            type="number"
            min={0}
            max={3600}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
            value={local.codDelaySeconds}
            disabled={!connected}
            onChange={(e) =>
              setLocal((s) => ({ ...s, codDelaySeconds: Math.max(0, parseInt(e.target.value, 10) || 0) }))
            }
          />
        </label>

        <label className="block text-sm">
          <span className="text-zinc-400">Confirmation keywords (comma-separated)</span>
          <input
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            value={local.confirmKeywords.join(', ')}
            disabled={!connected}
            onChange={(e) =>
              setLocal((s) => ({
                ...s,
                confirmKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
              }))
            }
          />
        </label>

        <label className="block text-sm">
          <span className="text-zinc-400">Cancel keywords (comma-separated)</span>
          <input
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            value={local.cancelKeywords.join(', ')}
            disabled={!connected}
            onChange={(e) =>
              setLocal((s) => ({
                ...s,
                cancelKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
              }))
            }
          />
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" disabled={saving || !connected} onClick={save}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
          <Button type="button" variant="secondary" disabled={resending || !connected} onClick={resendFailed}>
            <RefreshCw className={`h-4 w-4 mr-1 ${resending ? 'animate-spin' : ''}`} />
            Resend failed messages
          </Button>
        </div>

        {approvedCodTemplates.length === 0 && connected && (
          <p className="text-xs text-amber-400/90">
            Approve a COD template in Meta Business Manager, then sync templates.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
