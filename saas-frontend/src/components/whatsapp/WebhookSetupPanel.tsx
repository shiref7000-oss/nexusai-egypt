import { useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { whatsappApi, type WhatsAppWebhookAudit } from '@/lib/whatsappApi';

export function WebhookSetupPanel({
  webhookUrl,
  webhookVerified,
  connected,
  onUpdated,
}: {
  webhookUrl: string;
  webhookVerified: boolean;
  connected: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const [verifyToken, setVerifyToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<WhatsAppWebhookAudit | null>(null);

  async function runSetup() {
    setLoading(true);
    try {
      const res = await whatsappApi.webhookSetup(verifyToken.trim() || undefined);
      setAudit(res.data.audit);
      if (res.data.audit.webhookVerifiedInDb) {
        toast.success('Webhook verified');
        await onUpdated();
      } else if (res.data.audit.issues.length) {
        toast.error(res.data.audit.issues[0]);
      } else {
        toast.message('Webhook setup completed — confirm in Meta if still pending');
        await onUpdated();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Webhook setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={!webhookVerified ? 'border-amber-500/40' : undefined}>
      <CardHeader>
        <h2 className="text-lg font-semibold text-white">Webhook (Meta → NexusAI)</h2>
        <p className="text-sm text-zinc-500">
          {webhookVerified
            ? 'Verified — inbound messages and delivery/read statuses will sync.'
            : 'Pending — Meta must verify your callback URL to receive inbound events.'}
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="text-xs space-y-1">
          <p className="text-zinc-500">Callback URL (paste in Meta App → WhatsApp → Configuration):</p>
          <div className="flex gap-2">
            <code className="flex-1 text-zinc-300 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 break-all">
              {webhookUrl}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(webhookUrl);
                toast.success('Copied');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-zinc-600">
            Subscribe in Meta: <span className="text-zinc-400">messages</span>,{' '}
            <span className="text-zinc-400">message_template_status_update</span> (deliveries/reads are included in
            messages).
          </p>
        </div>

        {!webhookVerified && connected && (
          <>
            <label className="block text-sm">
              <span className="text-zinc-400">Webhook verify token (same as in Meta)</span>
              <input
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-sm"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Re-enter token from connect step"
              />
            </label>
            <Button type="button" disabled={loading || !connected} onClick={() => void runSetup()}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Verify webhook & subscribe WABA
            </Button>
          </>
        )}

        {audit && (
          <div className="text-xs rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2 font-mono">
            <p className="font-sans font-medium text-zinc-400">Audit result</p>
            <p>GET public verify: HTTP {audit.getVerifyStatus ?? '—'}</p>
            <p>WABA subscribed apps: {audit.wabaSubscribedApps.length || 0}</p>
            <p>DB verified: {audit.webhookVerifiedInDb ? 'yes' : 'no'}</p>
            {audit.issues.map((i) => (
              <p key={i} className="text-red-400/90 flex gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {i}
              </p>
            ))}
            {audit.hints.map((h) => (
              <p key={h} className="text-amber-400/80">
                {h}
              </p>
            ))}
            {!audit.issues.length && (
              <p className="text-emerald-400/90 flex gap-1">
                <Check className="h-3.5 w-3.5 shrink-0" /> All checks passed
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
