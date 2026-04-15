'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatUsdFromCents } from '@/lib/money';

type Row = { key: string; spendCents: number; count: number };

const SLICE_COLORS = [
  'hsl(156 72% 42%)',
  'hsl(200 75% 52%)',
  'hsl(280 55% 58%)',
  'hsl(38 92% 50%)',
  'hsl(340 70% 55%)',
  'hsl(172 60% 45%)',
  'hsl(220 70% 60%)',
  'hsl(25 90% 55%)',
];

export function SpendSportDonut({ rows }: { rows: Row[] }) {
  const total = useMemo(() => rows.reduce((s, r) => s + r.spendCents, 0), [rows]);
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: r.key,
        value: r.spendCents,
        pct: total > 0 ? (r.spendCents / total) * 100 : 0,
        count: r.count,
      })),
    [rows, total],
  );

  if (data.length === 0) {
    return <div className="py-8 text-center text-sm text-fg-muted">No spend data yet.</div>;
  }

  return (
    <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-center">
      <div className="mx-auto h-[200px] w-[200px] shrink-0 sm:h-[220px] sm:w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={1}
              stroke="hsl(222 28% 8%)"
              strokeWidth={1}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(222 28% 12%)',
                border: '1px solid hsl(217 19% 22%)',
                borderRadius: 12,
              }}
              formatter={(value) => formatUsdFromCents(Number(value))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {data.map((d, i) => (
          <li
            key={d.name}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-bg-muted/25 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                aria-hidden
              />
              <span className="truncate text-sm text-fg">{d.name}</span>
            </div>
            <div className="shrink-0 text-right text-sm tabular-nums">
              <div className="font-medium text-fg">{formatUsdFromCents(d.value)}</div>
              <div className="text-xs text-fg-muted">{d.pct.toFixed(0)}% · {d.count} cards</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
