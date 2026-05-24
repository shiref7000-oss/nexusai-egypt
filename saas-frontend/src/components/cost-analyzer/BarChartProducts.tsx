type Item = { label: string; value: number; color?: string };

export function BarChartProducts({
  items,
  formatValue = (n) => String(n),
  maxBars = 12,
}: {
  items: Item[];
  formatValue?: (n: number) => string;
  maxBars?: number;
}) {
  const shown = items.slice(0, maxBars);
  const max = Math.max(...shown.map((i) => i.value), 1);

  if (!shown.length) {
    return <p className="text-sm text-zinc-500 text-center py-6">No data</p>;
  }

  return (
    <ul className="space-y-2">
      {shown.map((item) => (
        <li key={item.label}>
          <div className="flex justify-between text-xs text-zinc-400 mb-1 gap-2">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums">{formatValue(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color || '#22d3ee',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
