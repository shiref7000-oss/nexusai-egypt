import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import {
  RefreshCw,
  Link2,
  Unlink,
  BarChart3,
  Sparkles,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import {
  metaAdsApi,
  type AdsAlert,
  type AdsIntelligence,
  type AdsPlatform,
  type DatePreset,
  type DateWindow,
  type MetaAdAccount,
  type MetaDashboard,
  type MetaStatus,
  type TrendPoint,
} from '@/lib/metaAdsApi';
import { PageHeader, StatCard } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TrendChart } from '@/components/meta/TrendChart';

function formatMoney(n: number, currency = 'EGP') {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPct(n: number) {
  return `${Number(n).toFixed(2)}%`;
}

const severityClass: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  opportunity: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  scaling_winner: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
};

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_3d', label: 'Last 3d' },
  { id: 'last_7d', label: 'Last 7d' },
  { id: 'last_14d', label: 'Last 14d' },
  { id: 'last_30d', label: 'Last 30d' },
  { id: 'last_90d', label: 'Last 90d' },
];

const PLATFORM_TABS: Array<{ id: AdsPlatform; label: string }> = [
  { id: 'meta', label: 'Meta' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'combined', label: 'Combined' },
];

export default function MetaAdsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const platformParam = (searchParams.get('platform') || 'meta') as AdsPlatform;
  const [platform, setPlatform] = useState<AdsPlatform>(
    PLATFORM_TABS.some((t) => t.id === platformParam) ? platformParam : 'meta'
  );
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [dashboard, setDashboard] = useState<MetaDashboard | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [intelligence, setIntelligence] = useState<AdsIntelligence | null>(null);
  const [alerts, setAlerts] = useState<AdsAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  const [trendMetric, setTrendMetric] = useState<'spend' | 'roas' | 'ctr' | 'purchases' | 'cpm'>('spend');
  const [windowPreset, setWindowPreset] = useState<DatePreset>('last_30d');
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [selectedWindow, setSelectedWindow] = useState<DateWindow>({ preset: 'last_30d' });
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const [workflowFilter, setWorkflowFilter] = useState<'all' | 'winners' | 'losers' | 'high_spend_no_conv' | 'fatigue' | 'low_ctr' | 'high_cpm' | 'scaling'>('all');
  const [campaignSortBy, setCampaignSortBy] = useState<'spend' | 'purchases' | 'roas' | 'ctr' | 'cpm'>('spend');
  const [refreshingAdvertisers, setRefreshingAdvertisers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const usePlatform = platform;
      const [st, dash] = await Promise.all([
        usePlatform === 'combined'
          ? metaAdsApi.hubStatus().then((r) => ({
              data: {
                connected: r.data.meta.connected || r.data.tiktok.connected,
                status: 'connected',
                lastSyncAt: null,
                lastSyncStatus: null,
                lastSyncError: null,
              } as MetaStatus,
            }))
          : metaAdsApi.status(usePlatform),
        metaAdsApi.dashboard(selectedWindow, usePlatform),
      ]);
      setStatus(st.data);
      setDashboard(dash.data);

      if (st.data.connected) {
        const [tr, ins, al] = await Promise.all([
          metaAdsApi.trends(selectedWindow, usePlatform),
          metaAdsApi.insights(selectedWindow, false, usePlatform),
          metaAdsApi.alerts('open', selectedWindow, usePlatform === 'combined' ? 'meta' : usePlatform),
        ]);
        setTrends(tr.data.trends);
        setIntelligence(ins.data);
        setAlerts(al.data.alerts);
      } else {
        setTrends([]);
        setIntelligence(null);
        setAlerts([]);
      }
    } catch (e: unknown) {
      const err = e as any;
      if (err?.status === 429) {
        const retryIn = Number(err?.retryAfter || 30);
        setRateLimitNotice(`Rate-limited. Showing latest cached data. Retry in ~${retryIn}s.`);
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to load ads data');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedWindow, platform]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const p = searchParams.get('platform') as AdsPlatform | null;
    if (p && PLATFORM_TABS.some((t) => t.id === p)) setPlatform(p);
  }, [searchParams]);

  const switchPlatform = (p: AdsPlatform) => {
    setPlatform(p);
    const next = new URLSearchParams(searchParams);
    next.set('platform', p);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      const label = platform === 'tiktok' ? 'TikTok' : 'Meta';
      toast.success(`${label} account connected`);
      searchParams.delete('connected');
      setSearchParams(searchParams, { replace: true });
      load();
    }
    const err = searchParams.get('error');
    if (err) {
      const detail = searchParams.get('detail');
      if (err === 'no_advertiser_accounts') {
        toast.error(
          detail ||
            'No TikTok Ads advertiser accounts found. Connect with Marketing API (Ads Manager), not creator Login Kit.'
        );
      } else {
        toast.error(detail ? `${err}: ${detail}` : `Connection failed: ${err}`);
      }
      searchParams.delete('error');
      searchParams.delete('detail');
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get('select_advertisers') === '1') {
      toast.message('Select one or more TikTok advertiser accounts below, then sync.');
      searchParams.delete('select_advertisers');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, load, platform]);

  const refreshTikTokAdvertisers = async () => {
    setRefreshingAdvertisers(true);
    try {
      const res = await metaAdsApi.refreshTikTokAdvertisers();
      toast.success(`Found ${res.data.count} advertiser account(s)`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not refresh advertisers');
    } finally {
      setRefreshingAdvertisers(false);
    }
  };

  const connect = async () => {
    if (platform === 'combined') {
      toast.message('Choose Meta or TikTok tab to connect an account');
      return;
    }
    setConnecting(true);
    try {
      const res = await metaAdsApi.oauthStart(platform);
      window.location.href = res.data.url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not start OAuth');
      setConnecting(false);
    }
  };

  const sync = async () => {
    if (platform === 'combined') {
      setSyncing(true);
      try {
        const [m, t] = await Promise.all([
          metaAdsApi.sync(14, 'meta').catch(() => null),
          metaAdsApi.sync(14, 'tiktok').catch(() => null),
        ]);
        const rows = (m?.data.insightRows || 0) + (t?.data.insightRows || 0);
        toast.success(`Synced ${rows} metric rows across platforms`);
        await load();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Sync failed');
      } finally {
        setSyncing(false);
      }
      return;
    }
    setSyncing(true);
    try {
      const res = await metaAdsApi.sync(14, platform);
      toast.success(`Synced ${res.data.insightRows} metric rows`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const refreshInsights = async () => {
    setRefreshingInsights(true);
    try {
      const ins = await metaAdsApi.insights(selectedWindow, true, platform);
      setIntelligence(ins.data);
      const al = await metaAdsApi.alerts(
        'open',
        selectedWindow,
        platform === 'combined' ? 'meta' : platform
      );
      setAlerts(al.data.alerts);
      toast.success('Insights refreshed');
    } catch (e: unknown) {
      const err = e as any;
      if (err?.status === 429) {
        const retryIn = Number(err?.retryAfter || 30);
        setRateLimitNotice(`Refresh throttled by API. Try again in ~${retryIn}s.`);
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to refresh insights');
      }
    } finally {
      setRefreshingInsights(false);
    }
  };

  const dismissAlert = async (id: number) => {
    try {
      await metaAdsApi.resolveAlert(id, platform === 'combined' ? 'meta' : platform);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error('Could not dismiss alert');
    }
  };

  const disconnect = async () => {
    if (platform === 'combined') return;
    try {
      await metaAdsApi.disconnect(platform);
      toast.success(`${platform === 'tiktok' ? 'TikTok' : 'Meta'} disconnected`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    }
  };

  const toggleAccount = async (acct: MetaAdAccount) => {
    if (platform === 'combined') return;
    try {
      await metaAdsApi.setAccountSelected(acct.id, !acct.is_selected, platform);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const connected = status?.connected === true;
  const summary = dashboard?.summary;
  const labels = trends.map((t) => t.date);
  const filteredInsights =
    intelligence?.insights.filter((i) => {
      if (workflowFilter === 'all') return true;
      if (workflowFilter === 'winners') return i.suggestedAction === 'KEEP_SCALING';
      if (workflowFilter === 'losers') return i.suggestedAction === 'PAUSE' || i.suggestedAction === 'KILL';
      if (workflowFilter === 'high_spend_no_conv') return i.category === 'no_conversions';
      if (workflowFilter === 'fatigue')
        return i.category === 'ad_fatigue' || i.category === 'video_fatigue';
      if (workflowFilter === 'low_ctr') return i.category === 'weak_ctr';
      if (workflowFilter === 'high_cpm') return i.category === 'cpm_spike';
      if (workflowFilter === 'scaling') return i.category === 'scaling_opportunity' || i.category === 'scalable';
      return true;
    }) || [];

  const sortedCampaigns = [...(dashboard?.topCampaigns || [])].sort((a, b) => {
    if (campaignSortBy === 'spend') return Number(b.spend) - Number(a.spend);
    if (campaignSortBy === 'purchases') return Number(b.purchases) - Number(a.purchases);
    if (campaignSortBy === 'roas') return Number(b.roas) - Number(a.roas);
    if (campaignSortBy === 'ctr') return Number(b.ctr) - Number(a.ctr);
    return Number(b.cpm || 0) - Number(a.cpm || 0);
  });

  const trendColors: Record<string, string> = {
    spend: '#60a5fa',
    roas: '#34d399',
    ctr: '#f472b6',
    purchases: '#a78bfa',
    cpm: '#fb923c',
  };

  const trendLabels: Record<string, string> = {
    spend: 'Spend',
    roas: 'ROAS',
    ctr: 'CTR',
    purchases: 'Purchases',
    cpm: 'CPM',
  };

  return (
    <div className="admin-page-shell">
      <Toaster position="top-center" richColors />
      <PageHeader
        className="mb-0"
        title="Ads Intelligence"
        description="Cross-platform AI decision engine — Meta, TikTok, and blended reporting."
        action={
          platform !== 'combined' && connected ? (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={syncing} onClick={sync}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button type="button" variant="ghost" onClick={disconnect}>
                <Unlink className="h-4 w-4 mr-1.5" />
                Disconnect
              </Button>
            </div>
          ) : platform !== 'combined' ? (
            <Button type="button" disabled={connecting} onClick={connect}>
              <Link2 className="h-4 w-4 mr-1.5" />
              {connecting ? 'Redirecting…' : `Connect ${platform === 'tiktok' ? 'TikTok' : 'Meta'}`}
            </Button>
          ) : (
            <Button type="button" variant="secondary" disabled={syncing} onClick={sync}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync all'}
            </Button>
          )
        }
      />

      <div className="admin-page-stack mt-6">
        <div className="flex flex-wrap gap-2">
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchPlatform(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                platform === tab.id
                  ? 'bg-violet-500/20 border-violet-400/40 text-violet-200'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {rateLimitNotice && (
          <Card>
            <CardBody>
              <p className="text-sm text-amber-300">{rateLimitNotice}</p>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardBody className="space-y-3">
            <CardHeader title="Integration status" />
            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : connected ? (
              <ul className="text-sm space-y-1 text-zinc-400">
                <li>
                  <span className="text-zinc-500">Status:</span>{' '}
                  <span className="text-green-400">{status?.status || 'connected'}</span>
                </li>
                <li>
                  <span className="text-zinc-500">Last sync:</span>{' '}
                  {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}
                </li>
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">
                Connect {platform === 'tiktok' ? 'TikTok' : platform === 'combined' ? 'Meta or TikTok' : 'Meta'} to unlock AI insights, trend analytics, and performance alerts.
              </p>
            )}
          </CardBody>
        </Card>

        {connected && platform === 'tiktok' && status?.needsAdvertiserSelection && (
          <Card>
            <CardBody>
              <p className="text-sm text-amber-300">
                Select at least one TikTok advertiser account before syncing. Marketing API accounts only — creator
                profiles will not appear here.
              </p>
            </CardBody>
          </Card>
        )}

        {connected && platform === 'tiktok' && (!status?.accounts || status.accounts.length === 0) && (
          <Card>
            <CardBody className="space-y-3">
              <p className="text-sm text-zinc-400">
                Connected but no advertiser accounts in database. Refresh from TikTok Marketing API or reconnect with
                an Ads Manager user.
              </p>
              <Button type="button" variant="secondary" disabled={refreshingAdvertisers} onClick={refreshTikTokAdvertisers}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshingAdvertisers ? 'animate-spin' : ''}`} />
                Refresh advertiser accounts
              </Button>
            </CardBody>
          </Card>
        )}

        {connected && status?.accounts && status.accounts.length > 0 && (
          <Card>
            <CardBody>
              <CardHeader
                title={platform === 'tiktok' ? 'TikTok advertiser accounts' : 'Ad accounts'}
                description="Select accounts for sync & analytics."
                action={
                  platform === 'tiktok' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={refreshingAdvertisers}
                      onClick={refreshTikTokAdvertisers}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshingAdvertisers ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  ) : undefined
                }
              />
              <ul className="divide-y divide-white/[0.06]">
                {status.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {a.advertiser_name || a.name || a.ad_account_id}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono">{a.ad_account_id}</p>
                      {platform === 'tiktok' && (
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {[a.currency, a.timezone, a.status || a.account_status].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <Switch checked={a.is_selected} onCheckedChange={() => toggleAccount(a)} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {connected && summary && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <StatCard label="Spend" value={formatMoney(Number(summary.spend))} />
              <StatCard label="Purchases" value={String(Math.round(Number(summary.purchases)))} />
              <StatCard label="CTR" value={formatPct(Number(summary.ctr))} />
              <StatCard label="CPC" value={formatMoney(Number(summary.cpc))} />
              <StatCard label="CPM" value={formatMoney(Number(summary.cpm))} />
              <StatCard label="ROAS" value={Number(summary.roas).toFixed(2)} />
            </div>

            {intelligence && (
              <Card>
                <CardBody className="space-y-4">
                  <CardHeader
                    title="AI account health"
                    description={intelligence.health.summary}
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={refreshingInsights}
                        onClick={refreshInsights}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        Refresh
                      </Button>
                    }
                  />
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-bold text-zinc-100">
                      {intelligence.health.grade}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{intelligence.health.headline}</p>
                      {intelligence.aiSummary && (
                        <p className="text-xs text-zinc-500 mt-1 whitespace-pre-wrap">
                          {intelligence.aiSummary}
                        </p>
                      )}
                    </div>
                  </div>
                  {intelligence.insights.length > 0 && (
                    <ul className="space-y-2">
                      {filteredInsights.slice(0, 12).map((ins) => (
                        <li
                          key={ins.id}
                          className={`text-sm border rounded-lg px-3 py-2 ${severityClass[ins.severity] || severityClass.warning}`}
                        >
                          <p className="font-medium">{ins.title} · {ins.suggestedAction.replace('_', ' ')}</p>
                          <p className="text-xs opacity-80 mt-0.5">{ins.message}</p>
                          <p className="text-xs opacity-75 mt-1">Why: {ins.reason} (confidence {(ins.confidenceScore * 100).toFixed(0)}%)</p>
                          {ins.entityId && (
                            <Link
                              to={`/meta-ads/campaign/${ins.entityId}?platform=${platform === 'combined' ? 'meta' : platform}&name=${encodeURIComponent(ins.entityName || '')}`}
                              className="text-xs underline mt-1 inline-block"
                            >
                              View campaign
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )}

            {alerts.length > 0 && (
              <Card>
                <CardBody>
                  <CardHeader
                    title="Active alerts"
                    action={<AlertTriangle className="h-4 w-4 text-amber-500" />}
                  />
                  <ul className="space-y-2">
                    {alerts.slice(0, 8).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start justify-between gap-3 text-sm border border-white/[0.06] rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-zinc-200">{a.title}</p>
                          <p className="text-xs text-zinc-500">{a.message}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => dismissAlert(a.id)}>
                          Dismiss
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}

            <Card>
              <CardBody>
                <CardHeader title="Trend analytics" description="Daily performance — last 30 days" />
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setWindowPreset(p.id);
                          setSelectedWindow({ preset: p.id });
                          setRateLimitNotice(null);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-md border ${
                          windowPreset === p.id
                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                            : 'border-white/[0.08] text-zinc-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWindowPreset('custom')}
                      className={`text-xs px-2.5 py-1 rounded-md border ${
                        windowPreset === 'custom'
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                          : 'border-white/[0.08] text-zinc-500'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {windowPreset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <input type="date" className="bg-zinc-900 border border-white/10 rounded px-2 py-1" value={customSince} onChange={(e) => setCustomSince(e.target.value)} />
                      <span className="text-zinc-500">to</span>
                      <input type="date" className="bg-zinc-900 border border-white/10 rounded px-2 py-1" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!customSince || !customUntil}
                        onClick={() => {
                          setSelectedWindow({ preset: 'custom', since: customSince, until: customUntil });
                          setRateLimitNotice(null);
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(['spend', 'roas', 'ctr', 'purchases', 'cpm'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTrendMetric(key)}
                      className={`text-xs px-2.5 py-1 rounded-md border ${
                        trendMetric === key
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                          : 'border-white/[0.08] text-zinc-500'
                      }`}
                    >
                      {trendLabels[key]}
                    </button>
                  ))}
                </div>
                <TrendChart
                  labels={labels}
                  series={[
                    {
                      key: trendMetric,
                      label: trendLabels[trendMetric],
                      color: trendColors[trendMetric],
                      values: trends.map((t) => t[trendMetric]),
                    },
                  ]}
                  formatValue={(n) =>
                    trendMetric === 'ctr' ? formatPct(n) : trendMetric === 'spend' || trendMetric === 'cpm' ? formatMoney(n) : n.toFixed(2)
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <CardHeader
                  title="Top campaigns"
                  description="Click a row for ad set & creative drill-down"
                  action={<BarChart3 className="h-4 w-4 text-zinc-500" />}
                />
                <div className="flex flex-wrap gap-2 mb-3">
                  <select
                    value={workflowFilter}
                    onChange={(e) => setWorkflowFilter(e.target.value as typeof workflowFilter)}
                    className="text-xs bg-zinc-900 border border-white/10 rounded px-2 py-1"
                  >
                    <option value="all">All</option>
                    <option value="winners">Winners only</option>
                    <option value="losers">Losing campaigns</option>
                    <option value="high_spend_no_conv">High spend, no conversions</option>
                    <option value="fatigue">Fatigue detected</option>
                    <option value="low_ctr">Low CTR</option>
                    <option value="high_cpm">High CPM</option>
                    <option value="scaling">Scaling opportunities</option>
                  </select>
                  <select
                    value={campaignSortBy}
                    onChange={(e) => setCampaignSortBy(e.target.value as typeof campaignSortBy)}
                    className="text-xs bg-zinc-900 border border-white/10 rounded px-2 py-1"
                  >
                    <option value="spend">Sort: Spend</option>
                    <option value="purchases">Sort: Purchases</option>
                    <option value="roas">Sort: ROAS</option>
                    <option value="ctr">Sort: CTR</option>
                    <option value="cpm">Sort: CPM</option>
                  </select>
                </div>
                {!dashboard?.topCampaigns?.length ? (
                  <p className="text-sm text-zinc-500">No campaign metrics yet. Run a sync.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-zinc-500 border-b border-white/[0.06]">
                          <th className="pb-2 pr-4">Campaign</th>
                          <th className="pb-2 pr-4">Spend</th>
                          <th className="pb-2 pr-4">Purchases</th>
                          <th className="pb-2 pr-4">CTR</th>
                          <th className="pb-2 pr-4">ROAS</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCampaigns.map((c) => (
                          <tr key={c.campaign_id} className="border-b border-white/[0.04]">
                            <td className="py-2.5 pr-4 max-w-[200px] truncate">{c.name}</td>
                            <td className="py-2.5 pr-4 tabular-nums">{formatMoney(Number(c.spend))}</td>
                            <td className="py-2.5 pr-4 tabular-nums">{Number(c.purchases)}</td>
                            <td className="py-2.5 pr-4 tabular-nums">{formatPct(Number(c.ctr))}</td>
                            <td className="py-2.5 pr-4 tabular-nums">{Number(c.roas).toFixed(2)}</td>
                            <td className="py-2.5">
                              <Link
                                to={`/meta-ads/campaign/${c.campaign_id}?platform=${(c as { platform?: string }).platform || platform === 'combined' ? 'meta' : platform}&name=${encodeURIComponent(c.name || '')}`}
                                className="inline-flex items-center text-xs text-blue-400 hover:text-blue-300"
                              >
                                Details
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
