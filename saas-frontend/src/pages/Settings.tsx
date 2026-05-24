import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { Copy, KeyRound, Plug, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { accountApi, type AccountSettings, type UserPreferences } from '@/lib/accountApi';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Language & time' },
  { id: 'connected', label: 'Connected accounts' },
  { id: 'api-keys', label: 'API keys' },
  { id: 'workspace', label: 'Workspace' },
] as const;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
  { value: 'fr', label: 'Français' },
];

const TIMEZONES = [
  'Africa/Cairo',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'UTC',
];

type SectionId = (typeof SECTIONS)[number]['id'];

export default function SettingsPage() {
  const { user, setSession } = useAuth();
  const token = localStorage.getItem('nexusai_token');
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SectionId>('profile');
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AccountSettings['profile'] | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [apiKeys, setApiKeys] = useState<AccountSettings['apiKeys']>([]);
  const [connected, setConnected] = useState<AccountSettings['connectedAccounts']>([]);
  const [baseline, setBaseline] = useState('');
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountApi.settings();
      const d = res.data;
      setProfile(d.profile);
      setPrefs(d.preferences);
      setApiKeys(d.apiKeys);
      setConnected(d.connectedAccounts);
      setBaseline(JSON.stringify({ profile: d.profile, preferences: d.preferences }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!profile || !prefs) return false;
    return baseline !== JSON.stringify({ profile, preferences: prefs });
  }, [baseline, profile, prefs]);

  const saveAll = async () => {
    if (!profile || !prefs) return;
    setSaving(true);
    const prevProfile = JSON.parse(baseline).profile as AccountSettings['profile'];
    const prevPrefs = JSON.parse(baseline).preferences as UserPreferences;

    try {
      const profileChanged =
        profile.name !== prevProfile.name ||
        profile.email !== prevProfile.email ||
        profile.phone !== prevProfile.phone ||
        profile.avatarUrl !== prevProfile.avatarUrl;

      if (profileChanged) {
        const res = await accountApi.patchProfile({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          avatarUrl: profile.avatarUrl,
        });
        setProfile((p) => (p ? { ...p, ...res.data.profile, avatarUrl: profile.avatarUrl } : p));
        if (token && user) {
          setSession(token, {
            ...user,
            name: res.data.profile.name,
            email: res.data.profile.email,
          });
        }
      }

      if (JSON.stringify(prefs) !== JSON.stringify(prevPrefs)) {
        const res = await accountApi.patchPreferences(prefs);
        setPrefs(res.data.preferences);
      }

      setBaseline(JSON.stringify({ profile, preferences: prefs }));
      toast.success('Settings saved');
    } catch (e: unknown) {
      setProfile(prevProfile);
      setPrefs(prevPrefs);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pwd.next !== pwd.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      await accountApi.changePassword(pwd.current, pwd.next);
      setPwd({ current: '', next: '', confirm: '' });
      toast.success('Password updated');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Password update failed');
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await accountApi.createApiKey(newKeyName.trim());
      setApiKeys((k) => [
        {
          id: res.data.key.id,
          name: res.data.key.name,
          key_prefix: res.data.key.key_prefix,
          last_used_at: null,
          created_at: new Date().toISOString(),
        },
        ...k,
      ]);
      setRevealedSecret(res.data.key.secret);
      setNewKeyName('');
      toast.success('API key created');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create key');
    }
  };

  const revokeKey = async (id: number) => {
    const prev = apiKeys;
    setApiKeys((k) => k.filter((x) => x.id !== id));
    try {
      await accountApi.revokeApiKey(id);
      toast.success('Key revoked');
    } catch (e: unknown) {
      setApiKeys(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to revoke');
    }
  };

  const setNotif = (key: keyof UserPreferences['notifications'], value: boolean) => {
    setPrefs((p) => (p ? { ...p, notifications: { ...p.notifications, [key]: value } } : p));
  };

  const setWorkspace = (key: keyof UserPreferences['workspace'], value: boolean | string) => {
    setPrefs((p) => (p ? { ...p, workspace: { ...p.workspace, [key]: value } } : p));
  };

  if (loading || !profile || !prefs) {
    return (
      <div className="page-shell max-w-6xl mx-auto">
        <div className="space-y-4">
          <div className="h-8 w-48 rounded-lg bg-white/[0.06] animate-pulse" />
          <div className="h-64 rounded-xl bg-white/[0.04] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-6xl mx-auto pb-24">
      <Toaster position="top-center" richColors />
      <PageHeader
        title="Settings"
        description="Profile, security, notifications, and workspace preferences."
      />

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <nav className="lg:w-48 shrink-0 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible pb-1 lg:pb-0 scrollbar-thin">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActive(s.id);
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                active === s.id
                  ? 'bg-white/[0.08] text-foreground'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-6 min-w-0">
          <SettingsSection id="profile" title="Profile" description="Your public identity in Nexus AI.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs text-zinc-500">Avatar URL</span>
                <div className="flex gap-3 items-center">
                  <div className="h-12 w-12 rounded-full border border-white/10 bg-elevated overflow-hidden shrink-0">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                        {profile.name?.[0] || profile.email[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <Input
                    value={profile.avatarUrl}
                    onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
                    placeholder="https://…"
                    className="flex-1"
                  />
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-zinc-500">Full name</span>
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-zinc-500">Email</span>
                <Input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-zinc-500">Phone</span>
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+20 …"
                />
              </label>
              <div className="text-xs text-zinc-500 sm:col-span-2">
                Plan: <span className="text-zinc-300 capitalize">{profile.plan}</span> · Role:{' '}
                <span className="text-zinc-300">{profile.role}</span>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection id="security" title="Password & security">
            <div className="grid gap-4 max-w-md">
              <Input
                type="password"
                placeholder="Current password"
                value={pwd.current}
                onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
              />
              <Input
                type="password"
                placeholder="New password"
                value={pwd.next}
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={changePassword}
                disabled={!pwd.current || !pwd.next}
              >
                Update password
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection id="notifications" title="Notifications">
            <ul className="divide-y divide-white/[0.06]">
              {(
                [
                  ['emailDigest', 'Email digest', 'Weekly summary of agent activity'],
                  ['agentAlerts', 'Agent alerts', 'Failures and queue delays'],
                  ['billingAlerts', 'Billing alerts', 'Usage thresholds and invoices'],
                  ['productUpdates', 'Product updates', 'New features and changelog'],
                ] as const
              ).map(([key, label, hint]) => (
                <li key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-zinc-500">{hint}</p>
                  </div>
                  <Switch checked={prefs.notifications[key]} onCheckedChange={(v) => setNotif(key, v)} />
                </li>
              ))}
            </ul>
          </SettingsSection>

          <SettingsSection id="preferences" title="Language & timezone">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs text-zinc-500">Language</span>
                <Select value={prefs.language} onValueChange={(v) => setPrefs({ ...prefs, language: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-zinc-500">Timezone</span>
                <Select value={prefs.timezone} onValueChange={(v) => setPrefs({ ...prefs, timezone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </SettingsSection>

          <SettingsSection
            id="connected"
            title="Connected accounts"
            description="Integrations linked to your workspace."
            action={
              isAdmin ? (
                <Link to="/admin/integrations" className="text-xs text-zinc-400 hover:text-zinc-200">
                  Manage →
                </Link>
              ) : undefined
            }
          >
            {connected.length === 0 ? (
              <p className="text-sm text-zinc-500">No integrations connected yet.</p>
            ) : (
              <ul className="space-y-2">
                {connected.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-elevated/40 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Plug className="h-4 w-4 text-zinc-500 shrink-0" />
                      <span className="text-sm truncate">{c.name}</span>
                    </div>
                    <span
                      className={cn(
                        'text-xs capitalize',
                        c.status === 'connected' ? 'text-emerald-400' : 'text-zinc-500'
                      )}
                    >
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SettingsSection>

          <SettingsSection id="api-keys" title="API keys" description="Use keys for server-to-server access.">
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <Input
                placeholder="Key name (e.g. production)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1"
              />
              <Button type="button" onClick={createKey} disabled={!newKeyName.trim()}>
                <KeyRound className="h-4 w-4 mr-1.5" />
                Create key
              </Button>
            </div>
            {revealedSecret && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <p className="text-amber-200/90 mb-2 font-medium">Copy your new key now</p>
                <code className="block break-all text-xs text-zinc-200">{revealedSecret}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedSecret);
                    toast.success('Copied');
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </div>
            )}
            {apiKeys.length === 0 ? (
              <p className="text-sm text-zinc-500">No API keys yet.</p>
            ) : (
              <ul className="space-y-2">
                {apiKeys.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="text-xs text-zinc-500 font-mono">{k.key_prefix}…</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => revokeKey(k.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SettingsSection>

          <SettingsSection id="workspace" title="Workspace preferences">
            <ul className="divide-y divide-white/[0.06]">
              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Compact sidebar</p>
                  <p className="text-xs text-zinc-500">Denser navigation on desktop</p>
                </div>
                <Switch
                  checked={prefs.workspace.compactSidebar}
                  onCheckedChange={(v) => setWorkspace('compactSidebar', v)}
                />
              </li>
              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Arabic customer responses</p>
                  <p className="text-xs text-zinc-500">Default agent replies in Arabic</p>
                </div>
                <Switch
                  checked={prefs.workspace.arabicResponses}
                  onCheckedChange={(v) => setWorkspace('arabicResponses', v)}
                />
              </li>
              <li className="py-3">
                <label className="space-y-1.5 block">
                  <span className="text-xs text-zinc-500">Default agent</span>
                  <Input
                    value={prefs.workspace.defaultAgent}
                    onChange={(e) => setWorkspace('defaultAgent', e.target.value)}
                  />
                </label>
              </li>
            </ul>
          </SettingsSection>
        </div>
      </div>

      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.08] bg-panel/95 backdrop-blur-md px-4 py-3 transition-transform duration-300',
          dirty ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">Unsaved changes</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const b = JSON.parse(baseline);
                setProfile(b.profile);
                setPrefs(b.preferences);
              }}
            >
              Discard
            </Button>
            <Button type="button" onClick={saveAll} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
