import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { metaAdsApi, type AdsPlatform, type CampaignDrillDown, type DatePreset, type DateWindow } from '@/lib/metaAdsApi';
import { PageHeader, StatCard } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendChart } from '@/components/meta/TrendChart';

function formatMoney(n: number) {
  return `EGP ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPct(n: number) {
  return `${Number(n).toFixed(2)}%`;
}

function MetricsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-zinc-800/60" />
      ))}
    </div>
  );
}

export default function MetaCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [searchParams] = useSearchParams();
  const platform = (searchParams.get('platform') || 'meta') as AdsPlatform;
  const campaignNameFromQuery = searchParams.get('name') || '';

  const [data, setData] = useState<CampaignDrillDown | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [bciProduct, setBciProduct] = useState<Record<string, unknown> | null>(null);
  const [bciLoading, setBciLoading] = useState(false);

  const [windowPreset, setWindowPreset] = useState<DatePreset>('last_30d');
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [appliedCustom, setAppliedCustom] = useState({ since: '', until: '' });

  const abortRef = useRef<AbortController | null>(null);

  /** Stable key — prevents useEffect infinite loop from new object identity each render. */
  const windowKey = useMemo(() => {
    if (windowPreset === 'custom') {
      if (!appliedCustom.since || !appliedCustom.until) return 'custom:pending';
      return `custom:${appliedCustom.since}:${appliedCustom.until}`;
    }
    return windowPreset;
  }, [windowPreset, appliedCustom.since, appliedCustom.until]);

  const selectedWindow = useMemo((): DateWindow | null => {
    if (windowPreset === 'custom') {
      if (!appliedCustom.since || !appliedCustom.until) return null;
      return { preset: 'custom', since: appliedCustom.since, until: appliedCustom.until };
    }
    return { preset: windowPreset };
  }, [windowPreset, appliedCustom.since, appliedCustom.until]);

  const loadMetrics = useCallback(async () => {
    if (!campaignId || !selectedWindow) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setMetricsLoading(true);
    setMetricsError(null);

    try {
      const res = await metaAdsApi.campaign(campaignId, selectedWindow, platform, {
        signal: ac.signal,
        timeoutMs: 15000,
      });
      if (ac.signal.aborted) return;
      setData(res.data);
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : 'Failed to load campaign';
      setMetricsError(msg);
      setData(null);
      toast.error(msg);
    } finally {
      if (!ac.signal.aborted) setMetricsLoading(false);
    }
  }, [campaignId, windowKey, platform, selectedWindow]);

  /** BCI product match — deferred, never blocks metrics shell. */
  const loadBci = useCallback(async () => {
    if (!campaignId || platform === 'combined') return;
    setBciLoading(true);
    try {
      const res = await metaAdsApi.campaignProductContext(platform, campaignId, {
        timeoutMs: 8000,
      });
      setBciProduct(res.data?.match || null);
    } catch {
      setBciProduct(null);
    } finally {
      setBciLoading(false);
    }
  }, [campaignId, platform]);

  useEffect(() => {
    if (windowPreset === 'custom' && windowKey === 'custom:pending') {
      setMetricsLoading(false);
      return;
    }
    loadMetrics();
    return () => abortRef.current?.abort();
  }, [loadMetrics, windowPreset, windowKey]);

  useEffect(() => {
    if (data && !metricsLoading) loadBci();
  }, [data, metricsLoading, loadBci]);

  const m = data?.campaign.metrics;
  const labels = (data?.trends || []).map((t) => t.date);
  const displayTitle = data?.campaign.name || campaignNameFromQuery || campaignId || 'Campaign';

  return (
    <div className="admin-page-shell">
      <PageHeader
        className="mb-0"
        title={displayTitle}
        description={data?.campaign.objective || 'Campaign drill-down'}
        action={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={metricsLoading} onClick={loadMetrics}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${metricsLoading ? 'animate-spin' : ''}`} />
              Retry
            </Button>
            <Link
              to={`/meta-ads?platform=${platform}`}
              className="inline-flex items-center text-sm text-zinc-400 hover:text-zinc-200"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </div>
        }
      />

      <div className="admin-page-stack mt-6">
        <Card>
          <CardBody className="space-y-3">
            <CardHeader title="Date range" />
            <div className="flex flex-wrap gap-2">
              {(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d'] as DatePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setWindowPreset(p)}
                  className={`text-xs px-2.5 py-1 rounded-md border ${
                    windowPreset === p
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-white/[0.08] text-zinc-500'
                  }`}
                >
                  {p.replace('last_', 'Last ').replace('_', ' ')}
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
                <input
                  type="date"
                  className="bg-zinc-900 border border-white/10 rounded px-2 py-1"
                  value={customSince}
                  onChange={(e) => setCustomSince(e.target.value)}
                />
                <span className="text-zinc-500">to</span>
                <input
                  type="date"
                  className="bg-zinc-900 border border-white/10 rounded px-2 py-1"
                  value={customUntil}
                  onChange={(e) => setCustomUntil(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAppliedCustom({ since: customSince, until: customUntil })}
                >
                  Apply
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {metricsError && !metricsLoading && (
          <Card>
            <CardBody>
              <p className="text-sm text-amber-300">{metricsError}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Metrics could not be loaded. Use Retry or check your ads connection and sync.
              </p>
            </CardBody>
          </Card>
        )}

        {metricsLoading && <MetricsSkeleton />}

        {!metricsLoading && !data && !metricsError && (
          <p className="text-sm text-zinc-500">Campaign not found or no data for this date range.</p>
        )}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Spend" value={formatMoney(m?.spend || 0)} />
              <StatCard label="ROAS" value={Number(m?.roas || 0).toFixed(2)} />
              <StatCard label="CTR" value={formatPct(m?.ctr || 0)} />
              <StatCard label="CPM" value={formatMoney(m?.cpm || 0)} />
              <StatCard label="Frequency" value={Number(m?.frequency || 0).toFixed(2)} />
            </div>

            {(bciLoading || bciProduct) && (
              <Card>
                <CardBody>
                  <CardHeader title="Product context" description="Inferred from business catalog (async)" />
                  {bciLoading ? (
                    <p className="text-xs text-zinc-500">Matching product…</p>
                  ) : bciProduct ? (
                    <p className="text-sm text-zinc-300">
                      {(bciProduct as { product_title?: string }).product_title || 'Matched product'}
                      {(bciProduct as { confidence?: number }).confidence != null && (
                        <span className="text-zinc-500 ml-2">
                          ({Math.round(Number((bciProduct as { confidence?: number }).confidence) * 100)}% confidence)
                        </span>
                      )}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            )}

            <Card>
              <CardBody>
                <CardHeader title="Performance trend" />
                <TrendChart
                  labels={labels}
                  series={[
                    { key: 'spend', label: 'Spend', color: '#60a5fa', values: data.trends.map((t) => t.spend) },
                    { key: 'roas', label: 'ROAS', color: '#34d399', values: data.trends.map((t) => t.roas) },
                  ]}
                  formatValue={(n) => n.toFixed(2)}
                />
              </CardBody>
            </Card>

            {data.adsets.map((adset) => (
              <Card key={adset.adset_id}>
                <CardBody className="space-y-4">
                  <CardHeader
                    title={adset.name}
                    description={`Ad set · Spend ${formatMoney(adset.metrics.spend)} · ROAS ${adset.metrics.roas.toFixed(2)}`}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-zinc-500 border-b border-white/[0.06]">
                          <th className="pb-2 pr-3">Ad / Creative</th>
                          <th className="pb-2 pr-3">Spend</th>
                          <th className="pb-2 pr-3">Purchases</th>
                          <th className="pb-2 pr-3">CTR</th>
                          <th className="pb-2 pr-3">CPC</th>
                          <th className="pb-2 pr-3">CPM</th>
                          <th className="pb-2">ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adset.ads.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-3 text-zinc-500">
                              No ad-level metrics synced yet.
                            </td>
                          </tr>
                        ) : (
                          adset.ads.map((ad) => (
                            <tr key={ad.ad_id} className="border-b border-white/[0.04]">
                              <td className="py-2.5 pr-3">
                                <div className="flex items-center gap-2 min-w-[180px]">
                                  {ad.creative_thumbnail_url ? (
                                    <img
                                      src={ad.creative_thumbnail_url}
                                      alt=""
                                      className="w-10 h-10 rounded object-cover bg-zinc-800"
                                      loading="lazy"
                                    />
                                  ) : null}
                                  <div>
                                    <p className="truncate max-w-[160px]">{ad.name}</p>
                                    {ad.creative_name && (
                                      <p className="text-xs text-zinc-500 truncate">{ad.creative_name}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 pr-3 tabular-nums">{formatMoney(ad.metrics.spend)}</td>
                              <td className="py-2.5 pr-3 tabular-nums">{ad.metrics.purchases}</td>
                              <td className="py-2.5 pr-3 tabular-nums">{formatPct(ad.metrics.ctr)}</td>
                              <td className="py-2.5 pr-3 tabular-nums">{formatMoney(ad.metrics.cpc)}</td>
                              <td className="py-2.5 pr-3 tabular-nums">{formatMoney(ad.metrics.cpm)}</td>
                              <td className="py-2.5 tabular-nums">{ad.metrics.roas.toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
