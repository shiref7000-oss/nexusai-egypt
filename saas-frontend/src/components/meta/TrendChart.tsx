type Series = { key: string; label: string; color: string; values: number[] };

type Props = {
  labels: string[];
  series: Series[];
  height?: number;
  formatValue?: (n: number) => string;
};

export function TrendChart({ labels, series, height = 160, formatValue = (n) => String(n) }: Props) {
  if (!labels.length || !series.length) {
    return <p className="text-sm text-zinc-500 py-8 text-center">No trend data yet. Sync to load history.</p>;
  }

  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(...allVals, 1);
  const min = Math.min(...allVals, 0);
  const range = max - min || 1;
  const w = 640;
  const h = height;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const xAt = (i: number) => pad.l + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const yAt = (v: number) => pad.t + innerH - ((v - min) / range) * innerH;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[320px]" role="img">
        {series.map((s) => {
          const points = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
          return (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
          );
        })}
        {labels.length > 0 && (
          <>
            <text x={pad.l} y={h - 4} className="fill-zinc-500 text-[10px]">
              {labels[0]?.slice(5)}
            </text>
            <text x={w - pad.r - 36} y={h - 4} className="fill-zinc-500 text-[10px]">
              {labels[labels.length - 1]?.slice(5)}
            </text>
          </>
        )}
      </svg>
      <ul className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-400">
        {series.map((s) => {
          const last = s.values[s.values.length - 1] ?? 0;
          return (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.label}: {formatValue(last)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
