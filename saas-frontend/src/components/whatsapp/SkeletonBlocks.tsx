export function StatSkeletonRow() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-zinc-800/60 border border-zinc-800" />
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 animate-pulse space-y-3">
      <div className="h-5 w-1/3 bg-zinc-800 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-zinc-800/80 rounded" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
