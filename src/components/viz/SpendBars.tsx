'use client';

import { formatUsdCompactFromCents, formatUsdFromCents } from '@/lib/money';

export function SpendBars({
  rows,
}: {
  rows: Array<{ key: string; spendCents: number; count: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.spendCents));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate text-sm text-fg">{r.key}</div>
            <div className="shrink-0 text-xs text-fg-muted">
              <span className="hidden sm:inline">{formatUsdFromCents(r.spendCents)}</span>
              <span className="sm:hidden">{formatUsdCompactFromCents(r.spendCents)}</span> · {r.count}
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-bg-muted">
            <div
              className="h-2 rounded-full bg-accent/70"
              style={{ width: `${Math.round((r.spendCents / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

