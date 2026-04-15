'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { formatUsdCompactFromCents, formatUsdFromCents } from '@/lib/money';

type Point = { month: string; spendCents: number; count: number };

/** `month` is `YYYY-MM` from Postgres / dashboard aggregation. */
function formatMonthLabel(m: string): string {
  const s = m.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(s);
  if (!match) return s;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return s;
  const d = new Date(y, mo - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function ActivityChart({ points }: { points: Point[] }) {
  const tooltipFormatter: NonNullable<TooltipProps<number, string>['formatter']> = (
    value,
    name,
  ) => {
    const label = name ?? '';
    if (label === 'spendCents') return [formatUsdFromCents(Number(value)), 'Spend'];
    return [String(value), label];
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 16, right: 16, left: 4, bottom: 12 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(156 72% 45%)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="hsl(156 72% 45%)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(217 19% 22% / 0.35)" strokeDasharray="5 8" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonthLabel}
          stroke="hsl(215 20% 70%)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          stroke="hsl(215 20% 70%)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatUsdCompactFromCents(Number(v))}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(222 28% 12%)',
            border: '1px solid hsl(217 19% 22%)',
            borderRadius: 12,
          }}
          labelStyle={{ color: 'hsl(210 40% 98%)' }}
          itemStyle={{ color: 'hsl(210 40% 98%)' }}
          formatter={tooltipFormatter as any}
          labelFormatter={(label) => formatMonthLabel(String(label))}
        />
        <Area
          type="monotone"
          dataKey="spendCents"
          stroke="hsl(156 72% 45%)"
          fill="url(#spendGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

