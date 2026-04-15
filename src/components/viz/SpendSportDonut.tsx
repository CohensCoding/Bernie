'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatUsdFromCents } from '@/lib/money';

type Row = { key: string; spendCents: number; count: number };
type DrillRow = { key: string; spendCents: number; countCards: number };

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

export function SpendSportDonut({
  rows,
  drilldown,
}: {
  rows: Row[];
  drilldown?: Record<string, DrillRow[]>;
}) {
  const total = useMemo(() => rows.reduce((s, r) => s + r.spendCents, 0), [rows]);
  const [open, setOpen] = useState<string | null>(null);
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
    <div className="flex flex-col gap-6">
      <div className="mx-auto h-[180px] w-[180px] shrink-0 sm:h-[200px] sm:w-[200px]">
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

      <ul className="w-full space-y-2">
        {data.map((d, i) => (
          <li key={d.name} className="overflow-hidden rounded-xl border border-border/50 bg-bg-muted/25">
            <button
              type="button"
              onClick={() => setOpen((cur) => (cur === d.name ? null : d.name))}
              className="flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-bg-elevated/30"
              aria-expanded={open === d.name}
            >
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-2"
                style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug text-fg break-words">{d.name}</div>
                <div className="mt-1 text-xs leading-relaxed text-fg-muted">
                  {d.pct.toFixed(0)}% of spend · {d.count} {d.count === 1 ? 'card' : 'cards'}
                </div>
              </div>
              <div className="shrink-0 pt-0.5 text-right">
                <div className="text-sm font-semibold tabular-nums text-fg">{formatUsdFromCents(d.value)}</div>
                <div className="mt-1 text-xs text-fg-muted">{open === d.name ? '–' : '+'}</div>
              </div>
            </button>

            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open === d.name ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {drilldown?.[d.name]?.length ? (
                  <div className="border-t border-border/60 bg-bg-elevated/20 px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                      Composition (top players)
                    </div>
                    <div className="mt-2 space-y-2">
                      {drilldown[d.name]!.slice(0, 6).map((p) => {
                        const share = d.value > 0 ? (p.spendCents / d.value) * 100 : 0;
                        return (
                          <div key={p.key} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-fg">{p.key}</div>
                              <div className="mt-0.5 text-xs text-fg-muted">
                                {p.countCards} {p.countCards === 1 ? 'card' : 'cards'} · {share.toFixed(0)}% of {d.name}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-medium tabular-nums text-fg">
                                {formatUsdFromCents(p.spendCents)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-border/60 bg-bg-elevated/15 px-3 py-3 text-sm text-fg-muted">
                    No drilldown data yet.
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
