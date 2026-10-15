// One-series bar chart for /vyuziti (daily views, monthly AI cost): thin bars, 2px gaps,
// rounded data-ends on the baseline, hover tooltip per bar. The tables beside it are the table view.
export default function BarChart({ data, format, label }: { data: { x: string; y: number }[]; format: (y: number) => string; label: string }) {
  const max = Math.max(...data.map((d) => d.y), 0);
  if (data.length === 0 || max === 0) return null;
  return (
    <figure className="mb-5" aria-label={label}>
      <figcaption className="mb-1 flex justify-between text-[12px] text-ink-secondary">
        <span>{label}</span>
        <span>max {format(max)}</span>
      </figcaption>
      <div className="flex h-28 items-end gap-[2px] border-b border-mist">
        {data.map((d) => (
          <div key={d.x} className="group relative flex h-full min-w-[3px] flex-1 items-end">
            <div className="w-full rounded-t-[4px] bg-ember group-hover:bg-ember-hover" style={{ height: `${Math.max((d.y / max) * 100, d.y > 0 ? 2 : 0)}%` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] text-paper group-hover:block">
              {d.x}: {format(d.y)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-ink-secondary">
        <span>{data[0].x}</span>
        <span>{data[data.length - 1].x}</span>
      </div>
    </figure>
  );
}
