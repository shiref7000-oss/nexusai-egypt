import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { whatsappApi, type WhatsAppTemplate, type WhatsAppTestVerification } from '@/lib/whatsappApi';
import { cn } from '@/lib/utils';

const TEST_VALUES = ['Test Customer', 'TEST-001', '99 EGP'];

function defaultTemplateKey(templates: WhatsAppTemplate[]): string {
  const approved = templates.filter(
    (t) => t.status === 'approved' && t.sendAllowed !== false && !t.testOnly
  );
  const shipped = approved.find((t) => t.key === 'order_shipped');
  if (shipped) return shipped.key;
  const zero = approved.find((t) => (t.bodyVariableCount ?? 0) === 0);
  return zero?.key ?? approved[0]?.key ?? '';
}

export function TestMessagePanel({
  templates,
  connected,
  workerReachable,
  onSent,
}: {
  templates: WhatsAppTemplate[];
  connected: boolean;
  workerReachable: boolean;
  onSent: () => void | Promise<void>;
}) {
  const approved = useMemo(
    () => templates.filter((t) => t.status === 'approved' && t.sendAllowed !== false && !t.testOnly),
    [templates]
  );
  const [phone, setPhone] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [verification, setVerification] = useState<WhatsAppTestVerification | null>(null);

  useEffect(() => {
    if (!templateKey && approved.length) {
      setTemplateKey(defaultTemplateKey(templates));
    }
  }, [approved.length, templateKey, templates]);

  const selected = approved.find((t) => t.key === templateKey);
  const varCount = selected?.bodyVariableCount ?? 0;
  const previewParams = varCount > 0 ? TEST_VALUES.slice(0, varCount) : [];

  async function handleSend() {
    if (!phone.trim()) {
      setStatus('error');
      setFeedback('Enter a phone number (E.164 without +, e.g. 2010xxxxxxxx).');
      return;
    }
    if (!templateKey) {
      setStatus('error');
      setFeedback('Select an approved template.');
      return;
    }

    setStatus('loading');
    setFeedback('Sending test template…');
    setVerification(null);

    try {
      const res = await whatsappApi.testMessage({
        phone: phone.trim(),
        templateKey,
        bodyParameters: varCount > 0 ? previewParams : undefined,
      });
      setStatus('success');
      setFeedback(res.data.message || 'Test message sent.');
      setVerification(res.data.verification || null);
      await onSent();
    } catch (e: unknown) {
      const err = e as Error & { data?: { expectedVariableCount?: number; actualVariableCount?: number } };
      setStatus('error');
      let msg = err instanceof Error ? err.message : 'Send failed';
      if (err.data?.expectedVariableCount != null) {
        msg = `${msg} (expected ${err.data.expectedVariableCount}, got ${err.data.actualVariableCount ?? 0})`;
      }
      setFeedback(msg);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="font-medium text-white">Send test message</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Choose any approved template. Sync from Meta first — variable count comes from the live template, not the catalog.
          </p>
          {templateKey === 'order_followup' && (
            <p className="text-xs text-amber-400/90 mt-1">
              order_followup uses language ar_EG and 0 body variables. If you see Access denied (#131005), test with
              order_shipped or cod_confirmation instead.
            </p>
          )}
        </div>
        {!workerReachable && connected && (
          <p className="text-xs text-amber-400 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Worker offline — test send still runs via API but queue-backed flows may lag.
          </p>
        )}

        <label className="block text-sm">
          <span className="text-zinc-400">Approved template</span>
          <select
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-sm"
            value={templateKey}
            disabled={!connected || status === 'loading' || !approved.length}
            onChange={(e) => setTemplateKey(e.target.value)}
          >
            {!approved.length && <option value="">No approved templates</option>}
            {approved.map((t) => (
              <option key={t.key} value={t.key}>
                {t.catalog?.label || t.metaName || t.key} · {t.category || 'UTILITY'} · {t.status} ·{' '}
                {t.bodyVariableCount ?? 0} var(s)
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className="text-xs text-zinc-500 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p>
              <span className="text-zinc-400">Meta name:</span> {selected.metaName}
            </p>
            <p>
              <span className="text-zinc-400">Variables:</span> {varCount}
              {varCount === 0 && ' — body parameters omitted'}
            </p>
            {varCount > 0 && (
              <p>
                <span className="text-zinc-400">Test values:</span> {previewParams.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
            placeholder="2010xxxxxxxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
                setFeedback(null);
                setVerification(null);
              }
            }}
            disabled={!connected || status === 'loading'}
          />
          <Button
            type="button"
            disabled={status === 'loading' || !connected || !templateKey}
            onClick={() => void handleSend()}
            aria-busy={status === 'loading'}
          >
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {status === 'loading' ? 'Sending…' : 'Send test'}
          </Button>
        </div>

        {feedback && (
          <p
            role="status"
            className={cn(
              'text-xs rounded-lg px-3 py-2 border flex gap-2',
              status === 'success' && 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50',
              status === 'error' && 'text-red-300 bg-red-950/40 border-red-800/50',
              status === 'loading' && 'text-zinc-400 bg-zinc-900 border-zinc-800'
            )}
          >
            {status === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            {status === 'success' && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            {feedback}
          </p>
        )}

        {verification && (
          <div className="text-xs rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2 font-mono">
            <p className="text-zinc-400 font-sans font-medium">Verification report</p>
            <p>
              <span className="text-zinc-500">Template:</span> {verification.selectedTemplate}
            </p>
            <p>
              <span className="text-zinc-500">Variables:</span> {verification.detectedVariableCount}
            </p>
            <p>
              <span className="text-zinc-500">Delivery:</span> {verification.deliveryStatus}
            </p>
            <p>
              <span className="text-zinc-500">Message ID:</span> {verification.messageId || '—'}
            </p>
            <details>
              <summary className="text-zinc-500 cursor-pointer">Payload & Meta response</summary>
              <pre className="mt-2 overflow-x-auto text-[10px] text-zinc-400 whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    payload: verification.generatedPayload,
                    metaResponse: verification.metaApiResponse,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
