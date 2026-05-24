import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  costAnalyzerApi,
  type ColumnMappingConfig,
  type ExtractionPreview as PreviewData,
  type RevenueMode,
} from '@/lib/costAnalyzerApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  reportId: string;
  initial?: PreviewData | null;
  onConfirm: (mapping: ColumnMappingConfig) => void;
  analyzing?: boolean;
  canAnalyze?: boolean;
};

const REVENUE_MODES: { value: RevenueMode; label: string }[] = [
  { value: 'collected', label: 'Collected / COD amount' },
  { value: 'line_total', label: 'Line or order total' },
  { value: 'unit_price_x_qty', label: 'Unit price × quantity' },
];

export function ExtractionPreviewPanel({
  reportId,
  initial,
  onConfirm,
  analyzing,
  canAnalyze = true,
}: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(initial);
  const [mapping, setMapping] = useState<ColumnMappingConfig | null>(initial?.mapping ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (override?: Partial<ColumnMappingConfig>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await costAnalyzerApi.preview(reportId, override || mapping || undefined);
        setPreview(res.data);
        setMapping(res.data.mapping);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    },
    [reportId, mapping]
  );

  useEffect(() => {
    if (!initial && reportId) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when no initial preview
  }, [reportId]);

  const updateMapping = (patch: Partial<ColumnMappingConfig>) => {
    if (!mapping) return;
    const next = {
      ...mapping,
      ...patch,
      orderFilters: { ...mapping.orderFilters, ...(patch.orderFilters || {}) },
    };
    setMapping(next);
    refresh(next);
  };

  if (loading && !preview) {
    return (
      <p className="text-sm text-zinc-400 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Detecting columns…
      </p>
    );
  }

  if (!preview || !mapping) {
    return <p className="text-sm text-red-300">{error || 'Could not load preview'}</p>;
  }

  const r = preview.reconciliation;
  const colOptions = (key: string) =>
    preview.headers.map((h) => (
      <option key={`${key}-${h}`} value={h}>
        {h}
      </option>
    ));

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Quantities are parsed from the <strong className="text-zinc-200">shipment description</strong> (e.g.{' '}
        <span dir="rtl" className="text-zinc-300">منفضة × 3</span>,{' '}
        <span dir="rtl" className="text-zinc-300">2 منفضة + ليفة</span>). Confirm columns before analysis.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <label className="space-y-1">
          <span className="text-zinc-500">Product name *</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.product}
            onChange={(e) => updateMapping({ product: e.target.value })}
          >
            <option value="">— None —</option>
            {colOptions('product')}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Quantity (empty = 1 per row)</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.quantity || ''}
            onChange={(e) => updateMapping({ quantity: e.target.value || null })}
          >
            <option value="">— None —</option>
            {colOptions('qty')}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Revenue / collection *</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.revenue}
            onChange={(e) => updateMapping({ revenue: e.target.value })}
          >
            <option value="">— None —</option>
            {colOptions('rev')}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Revenue meaning</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.revenueMode}
            onChange={(e) => updateMapping({ revenueMode: e.target.value as RevenueMode })}
          >
            {REVENUE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Order status</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.status || ''}
            onChange={(e) => updateMapping({ status: e.target.value || null })}
          >
            <option value="">— None —</option>
            {colOptions('status')}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Order ID (for order count)</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.orderId || ''}
            onChange={(e) => updateMapping({ orderId: e.target.value || null })}
          >
            <option value="">— None —</option>
            {colOptions('order')}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-zinc-500">Bundle multiplier</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
            value={mapping.bundleMultiplier || ''}
            onChange={(e) => updateMapping({ bundleMultiplier: e.target.value || null })}
          >
            <option value="">— None —</option>
            {colOptions('bundle')}
          </select>
        </label>
        {mapping.revenueMode === 'unit_price_x_qty' && (
          <label className="space-y-1">
            <span className="text-zinc-500">Unit price column</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-white"
              value={mapping.unitPrice || ''}
              onChange={(e) => updateMapping({ unitPrice: e.target.value || null })}
            >
              <option value="">— None —</option>
              {colOptions('price')}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={mapping.orderFilters.excludeCancelled}
            onChange={(e) =>
              updateMapping({ orderFilters: { ...mapping.orderFilters, excludeCancelled: e.target.checked } })
            }
          />
          Exclude cancelled
        </label>
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={mapping.orderFilters.excludeReturned}
            onChange={(e) =>
              updateMapping({ orderFilters: { ...mapping.orderFilters, excludeReturned: e.target.checked } })
            }
          />
          Exclude returned / refunded
        </label>
      </div>

      {preview.detectedStatuses.length > 0 && (
        <div className="text-xs text-zinc-500">
          <p className="mb-1 text-zinc-400">Statuses in file (optional: only include these — leave empty for all non-excluded):</p>
          <div className="flex flex-wrap gap-1">
            {preview.detectedStatuses.map((s) => {
              const on = mapping.orderFilters.includeOnlyStatuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    'px-2 py-0.5 rounded border text-xs',
                    on ? 'border-brand bg-brand/10 text-brand' : 'border-zinc-700 text-zinc-500'
                  )}
                  onClick={() => {
                    const list = mapping.orderFilters.includeOnlyStatuses;
                    const next = on ? list.filter((x) => x !== s) : [...list, s];
                    updateMapping({ orderFilters: { ...mapping.orderFilters, includeOnlyStatuses: next } });
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm space-y-2">
        <p className="font-medium text-white">Reconciliation preview</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-zinc-400">
          <span>Rows in file: <strong className="text-white">{r.rowsInFile}</strong></span>
          <span>Rows used: <strong className="text-white">{r.rowsProcessed}</strong></span>
          <span>Rows excluded: <strong className="text-white">{r.rowsExcluded}</strong></span>
          <span>Orders: <strong className="text-white">{r.ordersCounted ?? '—'}</strong></span>
          <span>Parsed units: <strong className="text-white">{r.parsedUnitsTotal ?? r.unitsCounted}</strong></span>
          {r.expectedUnitsTotal != null && (
            <span>
              Expected units: <strong className="text-white">{r.expectedUnitsTotal}</strong>
            </span>
          )}
          {r.quantityMismatches > 0 && (
            <span className="text-amber-300 col-span-full">
              Quantity mismatches: <strong>{r.quantityMismatches}</strong> rows (parsed ≠ expected ship count)
            </span>
          )}
          <span>
            Revenue ({r.revenueColumn}): <strong className="text-white">{r.revenueTotal}</strong>
          </span>
        </div>
        {Object.keys(r.excludedByStatus).length > 0 && (
          <p className="text-xs text-zinc-500">
            Excluded:{' '}
            {Object.entries(r.excludedByStatus)
              .map(([k, v]) => `${k} (${v})`)
              .join(', ')}
          </p>
        )}
      </div>

      {preview.parsedLines && preview.parsedLines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900 text-zinc-500">
              <tr>
                <th className="text-left p-2">Original description</th>
                <th className="text-left p-2">Parsed product</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {preview.parsedLines.map((line, i) => (
                <tr
                  key={`${line.rowIndex}-${line.parsedProduct}-${i}`}
                  className={cn(
                    'border-t border-zinc-800/80',
                    line.ambiguous && 'bg-amber-500/5'
                  )}
                >
                  <td className="p-2 text-zinc-400 max-w-[200px] truncate" title={line.originalDescription}>
                    {line.originalDescription}
                  </td>
                  <td className="p-2 text-zinc-200">{line.parsedProduct}</td>
                  <td className="p-2 text-right tabular-nums font-medium text-white">{line.parsedQuantity}</td>
                  <td className="p-2 text-right tabular-nums">
                    {Math.round(line.confidence * 100)}%
                    {line.ambiguous ? ' ⚠' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-40">
        <p className="text-xs text-zinc-500 px-2 pt-2">Aggregated by product (after alias merge)</p>
        <table className="w-full text-xs">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <th className="text-left p-2">Product</th>
              <th className="text-right p-2">Total qty</th>
              <th className="text-right p-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {preview.previewProducts.map((p) => (
              <tr key={p.normalizedName} className="border-t border-zinc-800/80">
                <td className="p-2 text-zinc-300">{p.productName}</td>
                <td className="p-2 text-right tabular-nums">{p.quantity}</td>
                <td className="p-2 text-right tabular-nums">{p.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh preview
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => onConfirm(mapping)}
          disabled={analyzing || !canAnalyze || loading}
        >
          {analyzing ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5 mr-2" />
          )}
          Run analysis with this mapping
        </Button>
      </div>
    </div>
  );
}
