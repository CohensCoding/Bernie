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
import { formatUsdFromCents } from '@/lib/money';

type Point = { month: string; spendCents: number; count: number };

function formatMonth(m: string) {
  // YYYY-MM -> e.g. 2026-03
  return m;
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
      <AreaChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(156 72% 45%)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="hsl(156 72% 45%)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(217 19% 22%)" strokeDasharray="4 6" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          stroke="hsl(215 20% 70%)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(215 20% 70%)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${Math.round(Number(v) / 100)}`}
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
          labelFormatter={(label) => `Month: ${label}`}
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

