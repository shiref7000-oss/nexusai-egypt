import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { KeyRound, Play, Save } from 'lucide-react';
import {
  adminApi,
  type AISettings,
  type AISettingsPayload,
  type AITestResult,
} from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FormState = Omit<AISettings, 'apiKeys' | 'updatedAt'> & {
  geminiKey: string;
  groqKey: string;
  openaiKey: string;
};

const PROVIDERS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'groq', label: 'Groq' },
  { id: 'openai', label: 'OpenAI (disabled)', disabled: true },
] as const;

function settingsToForm(s: AISettings): FormState {
  return {
    primaryProvider: s.primaryProvider,
    fallbackProvider: s.fallbackProvider,
    primaryModel: s.primaryModel,
    fallbackModel: s.fallbackModel,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    topP: s.topP,
    softLimitUsd: s.softLimitUsd,
    hardLimitUsd: s.hardLimitUsd,
    jsonMode: s.jsonMode,
    structuredOutput: s.structuredOutput,
    debugMode: s.debugMode,
    openaiEnabled: s.openaiEnabled,
    extendedFallback: s.extendedFallback,
    responseVerbosity: s.responseVerbosity,
    geminiKey: '',
    groqKey: '',
    openaiKey: '',
  };
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
        </div>
        <span className="text-sm tabular-nums text-zinc-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
    </div>
  );
}

export default function AdminAISettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [modelOptions, setModelOptions] = useState<
    Record<string, { label: string; models: string[] }>
  >({});
  const [apiKeys, setApiKeys] = useState<AISettings['apiKeys'] | null>(null);
  const [testPrompt, setTestPrompt] = useState('Say hello in one sentence.');
  const [testResult, setTestResult] = useState<AITestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.aiSettings();
      const data = res.data;
      setForm(settingsToForm(data.settings));
      setApiKeys(data.settings.apiKeys);
      setModelOptions(data.modelOptions ?? {});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const primaryModels = useMemo(
    () => modelOptions[form?.primaryProvider ?? 'gemini']?.models ?? [],
    [form?.primaryProvider, modelOptions]
  );
  const fallbackModels = useMemo(
    () => modelOptions[form?.fallbackProvider ?? 'groq']?.models ?? [],
    [form?.fallbackProvider, modelOptions]
  );

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const onSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body: AISettingsPayload = {
        primaryProvider: form.primaryProvider,
        fallbackProvider: form.fallbackProvider,
        primaryModel: form.primaryModel,
        fallbackModel: form.fallbackModel,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        topP: form.topP,
        softLimitUsd: form.softLimitUsd,
        hardLimitUsd: form.hardLimitUsd,
        jsonMode: form.jsonMode,
        structuredOutput: form.structuredOutput,
        debugMode: form.debugMode,
        openaiEnabled: form.openaiEnabled,
        extendedFallback: form.extendedFallback,
        responseVerbosity: form.responseVerbosity,
        apiKeys: {
          ...(form.geminiKey ? { gemini: form.geminiKey } : {}),
          ...(form.groqKey ? { groq: form.groqKey } : {}),
          ...(form.openaiKey ? { openai: form.openaiKey } : {}),
        },
      };
      await adminApi.updateAISettings(body);
      toast.success('AI settings saved');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.testAISettings({
        prompt: testPrompt,
        model: form.primaryModel,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        topP: form.topP,
        jsonMode: form.jsonMode,
        structuredOutput: form.structuredOutput,
      });
      setTestResult(res.data);
      toast.success('Test completed');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="page-shell max-w-3xl mx-auto py-10">
        <p className="text-sm text-zinc-500">Loading AI settings…</p>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-3xl mx-auto space-y-6 pb-10">
      <Toaster position="top-center" richColors />
      <PageHeader
        title="AI settings"
        description="Platform inference provider, models, limits, and API keys."
      />

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Providers & models
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Primary provider</label>
              <Select
                value={form.primaryProvider}
                onValueChange={(v) =>
                  patch({
                    primaryProvider: v as FormState['primaryProvider'],
                    primaryModel: modelOptions[v]?.models?.[0] ?? form.primaryModel,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.filter((p) => !p.disabled).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Primary model</label>
              <Select value={form.primaryModel} onValueChange={(v) => patch({ primaryModel: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {primaryModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Fallback provider</label>
              <Select
                value={form.fallbackProvider}
                onValueChange={(v) =>
                  patch({
                    fallbackProvider: v as FormState['fallbackProvider'],
                    fallbackModel: modelOptions[v]?.models?.[0] ?? form.fallbackModel,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.disabled}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Fallback model</label>
              <Select
                value={form.fallbackModel}
                onValueChange={(v) => patch({ fallbackModel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fallbackModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SliderRow
            label="Temperature"
            value={form.temperature}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => patch({ temperature: v })}
          />
          <SliderRow
            label="Max tokens"
            value={form.maxTokens}
            min={64}
            max={8192}
            step={64}
            onChange={(v) => patch({ maxTokens: v })}
          />
          <SliderRow
            label="Top P"
            value={form.topP}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ topP: v })}
          />

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Soft limit (USD / month)</label>
              <Input
                type="number"
                step="0.01"
                value={form.softLimitUsd}
                onChange={(e) => patch({ softLimitUsd: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">Hard limit (USD / month)</label>
              <Input
                type="number"
                step="0.01"
                value={form.hardLimitUsd}
                onChange={(e) => patch({ hardLimitUsd: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-zinc-800">
            {[
              ['JSON mode', 'jsonMode', form.jsonMode],
              ['Structured output', 'structuredOutput', form.structuredOutput],
              ['Debug mode', 'debugMode', form.debugMode],
              ['Extended fallback', 'extendedFallback', form.extendedFallback],
            ].map(([label, key, checked]) => (
              <div key={key as string} className="flex items-center justify-between">
                <span className="text-sm">{label as string}</span>
                <Switch
                  checked={checked as boolean}
                  onCheckedChange={(v) => patch({ [key as string]: v } as Partial<FormState>)}
                />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>API keys</CardHeader>
        <CardBody className="space-y-4">
          {apiKeys ? (
            <p className="text-xs text-zinc-500">
              Gemini: {apiKeys.gemini.configured ? apiKeys.gemini.masked : 'not set'} · Groq:{' '}
              {apiKeys.groq.configured ? apiKeys.groq.masked : 'not set'}
            </p>
          ) : null}
          <Input
            type="password"
            placeholder="New Gemini key (leave blank to keep)"
            value={form.geminiKey}
            onChange={(e) => patch({ geminiKey: e.target.value })}
          />
          <Input
            type="password"
            placeholder="New Groq key (leave blank to keep)"
            value={form.groqKey}
            onChange={(e) => patch({ groqKey: e.target.value })}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          Test inference
        </CardHeader>
        <CardBody className="space-y-3">
          <Input value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} />
          <Button type="button" variant="secondary" disabled={testing} onClick={() => void onTest()}>
            {testing ? 'Testing…' : 'Run test'}
          </Button>
          {testResult ? (
            <pre className="text-xs bg-zinc-900/80 p-3 rounded-lg overflow-auto max-h-48">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          ) : null}
        </CardBody>
      </Card>

      <Button type="button" disabled={saving} onClick={() => void onSave()} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
}
