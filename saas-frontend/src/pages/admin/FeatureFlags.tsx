import { useCallback, useEffect, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { adminApi, type PlatformFlags } from '@/lib/adminApi';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

const FLAG_META: { key: keyof PlatformFlags; label: string; description: string; risk?: boolean }[] = [
  {
    key: 'agents_enabled',
    label: 'AI agents',
    description: 'Allow agent runs and playground requests platform-wide.',
  },
  {
    key: 'beta_workflows',
    label: 'Beta workflows',
    description: 'Expose experimental workflow definitions to all users.',
  },
  {
    key: 'onboarding_enabled',
    label: 'Onboarding',
    description: 'Show the welcome flow for new sign-ins.',
  },
  {
    key: 'experimental_ui',
    label: 'Experimental UI',
    description: 'Enable in-progress layout and component experiments.',
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance mode',
    description: 'Show maintenance banner and block non-admin API writes.',
    risk: true,
  },
];

export default function AdminFeatureFlagsPage() {
  const [flags, setFlags] = useState<PlatformFlags | null>(null);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.platformFlags();
      setFlags(res.data);
      setBaseline(JSON.stringify(res.data));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = flags && baseline !== JSON.stringify(flags);

  const setFlag = (key: keyof PlatformFlags, value: boolean) => {
    setFlags((f) => (f ? { ...f, [key]: value } : f));
  };

  const save = async () => {
    if (!flags) return;
    const prev = JSON.parse(baseline) as PlatformFlags;
    setSaving(true);
    setFlags(flags);
    try {
      const res = await adminApi.updatePlatformFlags(flags);
      setFlags(res.data);
      setBaseline(JSON.stringify(res.data));
      toast.success('Platform flags saved');
    } catch (e: unknown) {
      setFlags(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell max-w-2xl mx-auto pb-20">
      <Toaster position="top-center" richColors />
      <PageHeader
        title="Feature flags"
        description="Platform toggles stored in PostgreSQL — applied on next request."
      />

      <Card>
        <CardBody>
          <CardHeader title="Production switches" />
          {loading || !flags ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {FLAG_META.map(({ key, label, description, risk }) => (
                <li key={key} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {label}
                      {risk && <span className="ml-2 text-[10px] text-red-400 uppercase">caution</span>}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                  </div>
                  <Switch checked={flags[key]} onCheckedChange={(v) => setFlag(key, v)} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {dirty && flags && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.08] bg-panel/95 backdrop-blur-md px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-sm text-zinc-400">Unsaved flag changes</p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setFlags(JSON.parse(baseline))}>
                Discard
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save flags'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
