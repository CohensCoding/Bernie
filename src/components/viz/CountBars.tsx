'use client';

export function CountBars({
  rows,
  valueLabel = 'cards',
}: {
  rows: Array<{ key: string; count: number }>;
  valueLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate text-sm text-fg">{r.key}</div>
            <div className="shrink-0 text-xs text-fg-muted">
              {r.count} {valueLabel}
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-bg-muted">
            <div
              className="h-2 rounded-full bg-accent/55"
              style={{ width: `${Math.round((r.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

