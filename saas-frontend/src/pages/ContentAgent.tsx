import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  History,
  Loader2,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import {
  contentAgentApi,
  type ContentGeneration,
  type ContentMeta,
  type ContentStatus,
  type ContentStyle,
  type ContentType,
  type BusinessProduct,
} from '@/lib/contentAgentApi';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STYLE_LABELS: Record<ContentStyle, string> = {
  casual_egyptian: 'عامية مصرية',
  formal_arabic: 'فصحى مبسطة',
  franco_arabic: 'Franco-Arabic',
  direct_response: 'Direct response',
  story_sell: 'Story sell',
  urgency: 'Urgency',
  luxury: 'Luxury',
  humor: 'Humor',
};

function formatOutput(output: Record<string, unknown>): string {
  if (typeof output.primary === 'string') return output.primary;
  if (Array.isArray(output.variants)) {
    return output.variants
      .map((v: { label?: string; body?: string }, i: number) => {
        const label = v?.label || `Variant ${i + 1}`;
        return `${label}\n${v?.body || ''}`;
      })
      .join('\n\n');
  }
  if (Array.isArray(output.hooks)) return (output.hooks as string[]).join('\n');
  return JSON.stringify(output, null, 2);
}

function statusBadge(status: ContentStatus) {
  const map: Record<ContentStatus, string> = {
    draft: 'bg-zinc-500/20 text-zinc-300',
    pending_review: 'bg-amber-500/20 text-amber-200',
    approved: 'bg-emerald-500/20 text-emerald-200',
    rejected: 'bg-red-500/20 text-red-300',
    archived: 'bg-zinc-600/20 text-zinc-400',
  };
  return map[status] || map.draft;
}

export default function ContentAgentPage() {
  const [meta, setMeta] = useState<ContentMeta | null>(null);
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [history, setHistory] = useState<ContentGeneration[]>([]);
  const [selected, setSelected] = useState<ContentGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [contentType, setContentType] = useState<ContentType>('facebook_ad');
  const [style, setStyle] = useState<ContentStyle>('casual_egyptian');
  const [brief, setBrief] = useState('');
  const [productId, setProductId] = useState<number | ''>('');
  const [regenerateHint, setRegenerateHint] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, p, h] = await Promise.all([
        contentAgentApi.meta(),
        contentAgentApi.products(),
        contentAgentApi.history({ limit: 40 }),
      ]);
      setMeta(m.data);
      setProducts(p.data || []);
      setHistory(h.data?.items || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load Content Agent');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const typeLabel = useMemo(
    () => meta?.contentTypes.find((t) => t.id === contentType)?.label || contentType,
    [meta, contentType],
  );

  async function handleGenerate(parentId?: string) {
    if (!brief.trim() && !parentId) {
      toast.error('أدخل موجز المحتوى');
      return;
    }
    setGenerating(true);
    try {
      const res = parentId
        ? await contentAgentApi.regenerate(parentId, {
            regenerateHint: regenerateHint || undefined,
            brief: brief.trim() || undefined,
          })
        : await contentAgentApi.generate({
            contentType,
            style,
            brief: brief.trim(),
            productId: productId ? Number(productId) : undefined,
          });
      if (!res.success || !res.data) {
        toast.error(res.error || 'Generation failed');
        return;
      }
      setSelected(res.data);
      toast.success(`تم التوليد (v${res.data.version}) — ${res.data.model}`);
      setRegenerateHint('');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Generation error');
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(status: ContentStatus) {
    if (!selected) return;
    try {
      const res = await contentAgentApi.setStatus(selected.id, status);
      setSelected(res.data);
      toast.success(`Status: ${status}`);
      await load();
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function runReview() {
    if (!selected) return;
    setGenerating(true);
    try {
      const res = await contentAgentApi.review(selected.id);
      setSelected(res.data);
      toast.success('Quality review complete');
      await load();
    } finally {
      setGenerating(false);
    }
  }

  function copyOutput() {
    if (!selected) return;
    const text = formatOutput(selected.output);
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-16">
      <PageHeader
        title="Egyptian Content Agent"
        description={`محتوى تسويقي بالعامية المصرية — نموذج ثابت ${meta?.model || 'gemini-2.5-flash'}`}
        action={
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <CardHeader title="توليد محتوى جديد" />
              <label className="block text-sm text-zinc-400">
                نوع المحتوى
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-panel px-3 py-2 text-foreground"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType)}
                >
                  {meta?.contentTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-zinc-400">
                الأسلوب
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-panel px-3 py-2"
                  value={style}
                  onChange={(e) => setStyle(e.target.value as ContentStyle)}
                >
                  {meta?.styles.map((s) => (
                    <option key={s} value={s}>
                      {STYLE_LABELS[s] || s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-zinc-400">
                منتج (اختياري)
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-panel px-3 py-2"
                  value={productId}
                  onChange={(e) =>
                    setProductId(e.target.value ? Number(e.target.value) : '')
                  }
                >
                  <option value="">— بدون منتج —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-zinc-400">
                الموجز / التفاصيل
                <textarea
                  className="mt-1 w-full min-h-[120px] rounded-lg border border-white/10 bg-panel px-3 py-2 text-foreground"
                  placeholder="مثال: عرض 20% لمدة 3 أيام، شحن COD، الجمهور: ستات Cairo..."
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
              </label>

              <Button
                className="w-full"
                disabled={generating}
                onClick={() => handleGenerate()}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate ({meta?.model})
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="السجل"
              action={<History className="h-4 w-4 text-zinc-500" />}
            />
            <CardBody className="max-h-[420px] overflow-y-auto space-y-2">
              {history.length === 0 ? (
                <EmptyState title="لا يوجد محتوى بعد" />
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-2 transition',
                      selected?.id === item.id
                        ? 'border-violet-500/50 bg-violet-500/10'
                        : 'border-white/6 hover:bg-white/5',
                    )}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {item.product_name || item.content_type}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          statusBadge(item.status),
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      v{item.version} · {item.latency_ms ?? '—'}ms ·{' '}
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </button>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="min-h-[520px]">
            <CardBody>
              <CardHeader
                title={selected ? typeLabel : 'المعاينة'}
                description={
                  selected
                    ? `${selected.content_type} · ${selected.style} · ${selected.model}`
                    : 'اختر عنصراً من السجل أو ولّد محتوى جديداً'
                }
                action={
                  selected ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={copyOutput}>
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generating}
                        onClick={() => handleGenerate(selected.id)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Regenerate
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              {!selected ? (
                <EmptyState
                  title="ابدأ بتوليد محتوى"
                  description="Facebook ads, WhatsApp, UGC, hooks — Egyptian dialect"
                />
              ) : (
                <div className="space-y-4">
                  {selected.quality_score && (
                    <div className="flex items-center gap-2 text-sm text-amber-200/90">
                      <ShieldCheck className="h-4 w-4" />
                      Quality score: {selected.quality_score}
                    </div>
                  )}

                  <pre className="whitespace-pre-wrap rounded-lg bg-black/30 border border-white/6 p-4 text-sm text-zinc-200 font-sans leading-relaxed">
                    {formatOutput(selected.output)}
                  </pre>

                  {selected.brief && (
                    <p className="text-xs text-zinc-500">
                      Brief: {selected.brief}
                    </p>
                  )}

                  <label className="block text-sm text-zinc-400">
                    تعليمات إعادة التوليد (اختياري)
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-panel px-3 py-2"
                      value={regenerateHint}
                      onChange={(e) => setRegenerateHint(e.target.value)}
                      placeholder="مثال: اختصر النص، زود إلحاح، Franco أكثر..."
                    />
                  </label>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/6">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={generating}
                      onClick={runReview}
                    >
                      AI Quality Review
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600/80 hover:bg-emerald-600"
                      onClick={() => setStatus('approved')}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setStatus('rejected')}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  </div>

                  <p className="text-[11px] text-zinc-600 tabular-nums">
                    tokens: {selected.total_tokens ?? '—'} · cost: $
                    {selected.cost_usd ?? '—'} · latency: {selected.latency_ms}ms
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
