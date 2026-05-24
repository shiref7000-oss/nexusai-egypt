import type { EngineeringAITelemetry } from '@/lib/adminApi';
import { cn } from '@/lib/utils';

const METRIC_HELP: Record<string, string> = {
  calls: 'Number of provider API calls recorded for this task.',
  totalTokens:
    'Sum of provider-reported total_tokens across all phases. N/A if the provider did not return usage metadata.',
  cost: 'Sum of provider-reported cost (USD) when available. N/A if not returned by the provider.',
  latency: 'Wall-clock latency summed across all calls.',
  flash: 'Calls routed to Flash-tier models.',
  pro: 'Calls routed to Pro-tier models.',
  avgCompression:
    'Weighted average context compression % across phases with valid provider countTokens (original > compressed).',
  originalContext:
    'Provider countTokens on the full prompt before compression (context only, not API usage).',
  compressedContext:
    'Provider countTokens on the prompt after compression (context only). Must be ≤ original.',
  savedContext: 'original_context_tokens − compressed_context_tokens (only when both are provider counts).',
  compressionPct:
    'Context compression: saved / original × 100. Shown only when compressed ≤ original; otherwise an error is flagged.',
  promptTokens: 'Provider usageMetadata: input/prompt tokens billed for this API call.',
  completionTokens: 'Provider usageMetadata: output/completion tokens for this API call.',
  totalTokensPhase: 'Provider usageMetadata: total tokens for this phase (sum of calls in phase).',
  phase: 'Pipeline phase grouping (understand → decompose → plan → implement → verify).',
  telemetryError:
    'Invalid context compression (e.g. compressed_context_tokens > original_context_tokens). Percentages are hidden.',
};

function fmtMetric(value: number | null | undefined, opts?: { prefix?: string; suffix?: string; digits?: number }) {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return 'N/A';
  const digits = opts?.digits ?? 0;
  const core = digits > 0 ? value.toFixed(digits) : value.toLocaleString();
  return `${opts?.prefix ?? ''}${core}${opts?.suffix ?? ''}`;
}

function Stat({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div title={tooltip}>
      <p className="text-zinc-500 text-xs cursor-help border-b border-dotted border-zinc-600 inline-block">
        {label}
      </p>
      <p className="text-zinc-200 font-medium">{value}</p>
    </div>
  );
}

const DISPLAY_PHASES = [
  'understand_task',
  'incremental_decompose',
  'implementation_plan',
  'implementation',
  'verification',
] as const;

export function EngineeringAITelemetryPanel({ data }: { data: EngineeringAITelemetry | null | undefined }) {
  if (!data || data.calls === 0) {
    return (
      <div className="rounded border border-zinc-800 p-3 text-sm text-zinc-500">
        No AI telemetry yet — calls appear after Flash/Pro routing runs on this task.
      </div>
    );
  }

  const compression = data.compression;
  const executions = data.executions ?? [];
  const byPhase = data.byPhase ?? [];
  const phaseRows = DISPLAY_PHASES.map((phase) => byPhase.find((p) => p.phase === phase)).filter(Boolean);

  return (
    <div className="rounded border border-zinc-800 p-3 space-y-4 text-sm">
      <p className="text-zinc-500 text-xs uppercase tracking-wide">AI model telemetry (provider-reported)</p>

      {compression.telemetryError && (
        <div
          className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300"
          title={METRIC_HELP.telemetryError}
        >
          <strong>Telemetry error:</strong> {compression.telemetryError}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Calls" value={String(data.calls)} tooltip={METRIC_HELP.calls} />
        <Stat label="Total tokens" value={fmtMetric(data.totalTokens)} tooltip={METRIC_HELP.totalTokens} />
        <Stat
          label="Cost (USD)"
          value={fmtMetric(data.totalCostUsd, { prefix: '$', digits: 4 })}
          tooltip={METRIC_HELP.cost}
        />
        <Stat
          label="Latency"
          value={`${(data.totalLatencyMs / 1000).toFixed(1)}s`}
          tooltip={METRIC_HELP.latency}
        />
        <Stat label="Flash calls" value={String(data.flashCalls)} tooltip={METRIC_HELP.flash} />
        <Stat label="Pro calls" value={String(data.proCalls)} tooltip={METRIC_HELP.pro} />
        <Stat
          label="Avg context compression"
          value={
            compression.avgCompressionPct != null ? `${compression.avgCompressionPct}%` : 'N/A'
          }
          tooltip={METRIC_HELP.avgCompression}
        />
      </div>

      {phaseRows.length > 0 && (
        <div className="overflow-x-auto">
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2">Usage by pipeline phase</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1 pr-2" title={METRIC_HELP.phase}>
                  Phase
                </th>
                <th className="text-left py-1 pr-2">Model</th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.promptTokens}>
                  Prompt
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.completionTokens}>
                  Completion
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.totalTokensPhase}>
                  Total
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.originalContext}>
                  Orig ctx
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.compressedContext}>
                  Comp ctx
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.savedContext}>
                  Saved
                </th>
                <th className="text-right py-1" title={METRIC_HELP.compressionPct}>
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {phaseRows.map((row) => (
                <tr
                  key={row!.phase}
                  className={cn(
                    'border-b border-zinc-800/50',
                    row!.telemetryError ? 'bg-red-950/20' : undefined
                  )}
                >
                  <td className="py-1.5 pr-2 font-mono text-zinc-300">{row!.phase}</td>
                  <td className="py-1.5 pr-2 text-zinc-400">{row!.model ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtMetric(row!.promptTokens)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtMetric(row!.completionTokens)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtMetric(row!.totalTokens)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtMetric(row!.originalContextTokens)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtMetric(row!.compressedContextTokens)}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtMetric(row!.savedContextTokens)}</td>
                  <td className="py-1.5 text-right">
                    {row!.telemetryError ? (
                      <span className="text-red-400" title={row!.telemetryError}>
                        Error
                      </span>
                    ) : row!.compressionPct != null ? (
                      `${row!.compressionPct}%`
                    ) : (
                      'N/A'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {executions.length > 0 && (
        <div className="overflow-x-auto">
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Per-call detail</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1 pr-2">Phase</th>
                <th className="text-left py-1 pr-2">Model</th>
                <th className="text-right py-1 pr-2">Latency</th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.promptTokens}>
                  Prompt
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.completionTokens}>
                  Out
                </th>
                <th className="text-right py-1 pr-2">Total</th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.originalContext}>
                  Orig ctx
                </th>
                <th className="text-right py-1 pr-2" title={METRIC_HELP.compressedContext}>
                  Comp ctx
                </th>
                <th className="text-right py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-zinc-800/50',
                    row.telemetryError ? 'bg-red-950/20' : undefined
                  )}
                >
                  <td className="py-1 pr-2 font-mono text-zinc-400">{row.engineeringTask}</td>
                  <td className="py-1 pr-2 text-zinc-300">{row.model}</td>
                  <td className="py-1 pr-2 text-right">{row.latencyMs}ms</td>
                  <td className="py-1 pr-2 text-right">{fmtMetric(row.promptTokens)}</td>
                  <td className="py-1 pr-2 text-right">{fmtMetric(row.completionTokens)}</td>
                  <td className="py-1 pr-2 text-right">{fmtMetric(row.totalTokens)}</td>
                  <td className="py-1 pr-2 text-right">{fmtMetric(row.originalContextTokens)}</td>
                  <td className="py-1 pr-2 text-right">{fmtMetric(row.compressedContextTokens)}</td>
                  <td className="py-1 text-right text-zinc-500">
                    {row.telemetryError ? (
                      <span className="text-red-400" title={row.telemetryError}>
                        Err
                      </span>
                    ) : row.success ? (
                      'OK'
                    ) : (
                      'Fail'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
