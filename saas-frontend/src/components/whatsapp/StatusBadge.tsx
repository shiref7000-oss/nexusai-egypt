import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  connected: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  disconnected: 'text-zinc-400 bg-zinc-800/60 border-zinc-700',
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  rejected: 'text-red-400 bg-red-500/10 border-red-500/30',
  error: 'text-red-400 bg-red-500/10 border-red-500/30',
  failed: 'text-red-400 bg-red-500/10 border-red-500/30',
  sent: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  delivered: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  read: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  queued: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  received: 'text-zinc-300 bg-zinc-800/60 border-zinc-600',
  processing: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  backlog: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  idle: 'text-zinc-400 bg-zinc-800/60 border-zinc-700',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status?.toLowerCase().replace(/\s+/g, '_') || 'pending';
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border capitalize',
        styles[key] || styles.pending,
        className
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
