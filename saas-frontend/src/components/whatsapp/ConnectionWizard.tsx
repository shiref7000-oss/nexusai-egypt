import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Shield, ChevronRight, ChevronLeft, FlaskConical, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { whatsappApi } from '@/lib/whatsappApi';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'metaAppId', label: 'Meta App ID', hint: 'From Meta Developer App dashboard' },
  { id: 'wabaId', label: 'WABA ID', hint: 'WhatsApp Business Account ID' },
  { id: 'phoneNumberId', label: 'Phone Number ID', hint: 'From Meta → WhatsApp → API Setup (Phone number ID — not WABA ID)' },
  { id: 'accessToken', label: 'Access Token', hint: 'Permanent system user token', secret: true },
  { id: 'webhookVerifyToken', label: 'Webhook Verify Token', hint: 'Choose a secret string for Meta webhook', secret: true },
  { id: 'verify', label: 'Verify & connect', hint: 'Test credentials then save' },
] as const;

type FormState = {
  metaAppId: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  webhookVerifyToken: string;
  displayPhone: string;
  businessName: string;
};

type TestUiStatus = 'idle' | 'loading' | 'success' | 'error';

const emptyForm: FormState = {
  metaAppId: '',
  wabaId: '',
  phoneNumberId: '',
  accessToken: '',
  webhookVerifyToken: '',
  displayPhone: '',
  businessName: '',
};

export function ConnectionWizard({
  webhookUrl,
  onConnected,
  initialMetaAppId,
}: {
  webhookUrl: string;
  onConnected: () => void;
  initialMetaAppId?: string | null;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({ ...emptyForm, metaAppId: initialMetaAppId || '' });
  const [testStatus, setTestStatus] = useState<TestUiStatus>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const current = STEPS[step];
  const field = current.id as keyof FormState;
  const testPassed = testStatus === 'success';

  function validateStep(): boolean {
    if (current.id === 'verify') {
      return !!(form.metaAppId && form.wabaId && form.phoneNumberId && form.accessToken && form.webhookVerifyToken);
    }
    const v = form[field as keyof FormState];
    return typeof v === 'string' && v.trim().length > 0;
  }

  async function runTest() {
    setTestStatus('loading');
    setTestMessage('Calling Meta Graph API (up to 14s)…');
    try {
      const res = await whatsappApi.testConnection(
        form.phoneNumberId,
        form.accessToken,
        form.wabaId.trim() || undefined
      );
      const detail = res.data?.displayPhone
        ? `Verified ${res.data.displayPhone}${res.data.verifiedName ? ` (${res.data.verifiedName})` : ''}${res.data.hint ? ` — ${res.data.hint}` : ''}`
        : res.data?.hint || res.data?.message || 'Credentials verified with Meta Graph API.';
      if (res.data?.resolvedPhoneNumberId && res.data.resolvedPhoneNumberId !== form.phoneNumberId) {
        setForm((f) => ({ ...f, phoneNumberId: res.data!.resolvedPhoneNumberId! }));
      }
      setTestStatus('success');
      setTestMessage(detail);
      if (res.data?.displayPhone) {
        setForm((f) => ({ ...f, displayPhone: res.data!.displayPhone || f.displayPhone }));
      }
      if (res.data?.verifiedName) {
        setForm((f) => ({ ...f, businessName: res.data!.verifiedName || f.businessName }));
      }
      toast.success('Connection test passed');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection test failed';
      setTestStatus('error');
      setTestMessage(
        msg.includes('timed out') ? `${msg} — check network or Meta API status.` : msg
      );
      toast.error(msg);
    } finally {
      setTestStatus((s) => (s === 'loading' ? 'error' : s));
      setTestMessage((m) =>
        m === 'Calling Meta Graph API (up to 14s)…' ? 'Test ended without a result — retry.' : m
      );
    }
  }

  async function finishConnect() {
    if (!testPassed) {
      setConnectError('Run a successful connection test before connecting.');
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      await whatsappApi.connect({
        metaAppId: form.metaAppId.trim(),
        wabaId: form.wabaId.trim(),
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
        webhookVerifyToken: form.webhookVerifyToken.trim(),
        displayPhone: form.displayPhone.trim() || undefined,
        businessName: form.businessName.trim() || undefined,
      });
      toast.success('WhatsApp connected');
      setForm((f) => ({ ...f, accessToken: '', webhookVerifyToken: '' }));
      onConnected();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connect failed';
      setConnectError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied');
  }

  return (
    <Card className="border-brand/20">
      <CardHeader>
        <h2 className="text-xl font-semibold text-white">Connect WhatsApp Cloud API</h2>
        <p className="text-sm text-zinc-500 mt-1">Step {step + 1} of {STEPS.length} — {current.label}</p>
        <div className="flex gap-1 mt-4">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-zinc-800'}`}
            />
          ))}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {current.id !== 'verify' ? (
          <label className="block">
            <span className="text-sm text-zinc-300">{current.label}</span>
            <p className="text-xs text-zinc-500 mb-2">{current.hint}</p>
            <input
              type={'secret' in current && current.secret ? 'password' : 'text'}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-white text-sm"
              value={form[field as keyof FormState] as string}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              autoComplete="off"
            />
          </label>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-zinc-400 flex items-start gap-2">
              <Shield className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
              Tokens are encrypted server-side and never returned to the browser after save.
            </p>
            <dl className="grid grid-cols-2 gap-2 text-zinc-400">
              <dt>App ID</dt>
              <dd className="font-mono text-xs text-white truncate">{form.metaAppId || '—'}</dd>
              <dt>WABA</dt>
              <dd className="font-mono text-xs text-white truncate">{form.wabaId || '—'}</dd>
              <dt>Phone ID</dt>
              <dd className="font-mono text-xs text-white truncate">{form.phoneNumberId || '—'}</dd>
            </dl>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Webhook callback URL</p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs p-2 rounded bg-zinc-900 border border-zinc-700 break-all text-zinc-300">
                  {webhookUrl}
                </code>
                <Button type="button" variant="secondary" size="sm" onClick={copyWebhook}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Button
                type="button"
                variant="secondary"
                onClick={runTest}
                disabled={testStatus === 'loading' || !validateStep()}
                aria-busy={testStatus === 'loading'}
              >
                {testStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-1" />
                )}
                {testStatus === 'loading' ? 'Testing connection…' : 'Test connection'}
                {testPassed && <Check className="h-4 w-4 ml-2 text-emerald-400" />}
              </Button>
              {testMessage && (
                <p
                  role="status"
                  className={cn(
                    'text-xs rounded-lg px-3 py-2 border',
                    testStatus === 'success' && 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50',
                    testStatus === 'error' && 'text-red-300 bg-red-950/40 border-red-800/50 flex gap-2',
                    testStatus === 'loading' && 'text-zinc-400 bg-zinc-900 border-zinc-800'
                  )}
                >
                  {testStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  {testStatus === 'loading' ? 'Calling Meta Graph API (up to 14s)…' : testMessage}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="secondary"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!validateStep()}
              onClick={() => setStep((s) => s + 1)}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <div className="flex flex-col items-end gap-2">
              {connectError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {connectError}
                </p>
              )}
              <Button
                type="button"
                disabled={connecting || !testPassed}
                onClick={finishConnect}
                aria-busy={connecting}
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                {connecting ? 'Connecting…' : 'Connect WhatsApp'}
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
