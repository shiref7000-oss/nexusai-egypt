import { PIPELINE_PHASES } from '@/lib/engineeringPipeline';
import { cn } from '@/lib/utils';

type Props = {
  currentPhase: string | null | undefined;
  understandingConfidence?: number | null;
  implementationConfidence?: number | null;
  verificationConfidence?: number | null;
  compact?: boolean;
};

export function EngineeringPipelineBar({
  currentPhase,
  understandingConfidence,
  implementationConfidence,
  verificationConfidence,
  compact,
}: Props) {
  const idx = currentPhase ? PIPELINE_PHASES.indexOf(currentPhase as (typeof PIPELINE_PHASES)[number]) : -1;

  return (
    <div className={cn('space-y-2', compact && 'text-xs')}>
      <div className="flex flex-wrap gap-1">
        {PIPELINE_PHASES.map((p, i) => {
          const done = idx >= 0 && i < idx;
          const active = p === currentPhase;
          return (
            <span
              key={p}
              title={p}
              className={cn(
                'px-1.5 py-0.5 rounded border font-mono text-[10px]',
                done && 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
                active && 'border-cyan-500/50 text-cyan-300 bg-cyan-500/15',
                !done && !active && 'border-zinc-700 text-zinc-500'
              )}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
          <span>
            Understand:{' '}
            <strong className="text-zinc-200">{understandingConfidence ?? '—'}%</strong>
          </span>
          <span>
            Implement:{' '}
            <strong className="text-zinc-200">{implementationConfidence ?? '—'}%</strong>
          </span>
          <span>
            Verify:{' '}
            <strong className="text-zinc-200">{verificationConfidence ?? '—'}%</strong>
          </span>
        </div>
      )}
    </div>
  );
}
