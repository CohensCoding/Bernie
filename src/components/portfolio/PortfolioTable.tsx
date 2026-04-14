'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PortfolioRow } from '@/lib/db/portfolio';
import { formatUsdFromCents } from '@/lib/money';

type SortKey =
  | 'player'
  | 'year'
  | 'brandSet'
  | 'grade'
  | 'purchasePrice'
  | 'totalCost'
  | 'purchaseDate'
  | 'sport'
  | 'team';

type SortDir = 'asc' | 'desc';

function norm(s: string | null | undefined) {
  return (s ?? '').toString().trim().toLowerCase();
}

export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('All');
  const [graded, setGraded] = useState<'All' | 'Graded' | 'Raw'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sports = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add((r.card.sport ?? 'Unknown').trim() || 'Unknown');
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((r) => {
      if (sport !== 'All' && (r.card.sport ?? 'Unknown') !== sport) return false;
      if (graded === 'Graded' && !r.card.graded) return false;
      if (graded === 'Raw' && r.card.graded) return false;

      if (!q) return true;
      const hay = [
        r.card.player_name,
        r.card.team,
        r.card.sport,
        r.card.brand,
        r.card.set_name,
        r.card.parallel,
        r.card.grade,
        r.latestTransaction?.platform,
      ]
        .map(norm)
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, query, sport, graded]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const get = (r: PortfolioRow) => {
      const c = r.card;
      const t = r.latestTransaction;
      switch (sortKey) {
        case 'player':
          return norm(c.player_name);
        case 'year':
          return c.year ?? -1;
        case 'brandSet':
          return `${norm(c.brand)} ${norm(c.set_name)}`;
        case 'grade':
          return `${c.graded ? 1 : 0} ${norm(c.grading_company)} ${norm(c.grade)}`;
        case 'purchasePrice':
          return t?.purchase_price_cents ?? -1;
        case 'totalCost':
          return t?.total_cost_cents ?? -1;
        case 'purchaseDate':
          return t?.purchase_date ?? '';
        case 'sport':
          return norm(c.sport);
        case 'team':
          return norm(c.team);
      }
    };
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = get(a) as any;
      const bv = get(b) as any;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(next);
      setSortDir('desc');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player, team, set, parallel…"
            className="w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg-muted outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
          >
            {sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={graded}
            onChange={(e) => setGraded(e.target.value as any)}
            className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="All">All</option>
            <option value="Graded">Graded</option>
            <option value="Raw">Raw</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-[980px] w-full border-separate border-spacing-0">
          <thead className="bg-bg-muted">
            <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('player')}>
                Player
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('year')}>
                Year
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('brandSet')}>
                Brand / Set
              </th>
              <th className="px-4 py-3">Parallel</th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('grade')}>
                Grade
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('purchasePrice')}>
                Purchase
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('totalCost')}>
                Total cost
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('purchaseDate')}>
                Date
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('sport')}>
                Sport
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('team')}>
                Team
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const c = r.card;
              const t = r.latestTransaction;
              const gradeLabel = c.graded ? `${c.grading_company ?? ''} ${c.grade ?? ''}`.trim() : 'Raw';
              return (
                <tr key={c.id} className="border-t border-border hover:bg-bg-elevated/60">
                  <td className="px-4 py-3 text-sm text-fg">
                    <Link href={`/cards/${c.id}`} className="hover:underline underline-offset-4">
                      {c.player_name ?? 'Unknown'}
                    </Link>
                    <div className="mt-1 text-xs text-fg-muted">{c.set_name ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-fg">{c.year ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-fg">
                    {c.brand ?? '—'}
                    <span className="text-fg-muted"> · </span>
                    {c.set_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-fg">{c.parallel ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-fg">{gradeLabel}</td>
                  <td className="px-4 py-3 text-sm text-fg">
                    {t ? formatUsdFromCents(t.purchase_price_cents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-fg">
                    {t ? formatUsdFromCents(t.total_cost_cents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-fg">{t?.purchase_date ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-fg">{c.sport ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-fg">{c.team ?? '—'}</td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-fg-muted" colSpan={10}>
                  No results.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-fg-muted">
        Showing <span className="text-fg">{sorted.length}</span> of{' '}
        <span className="text-fg">{rows.length}</span>
      </div>
    </div>
  );
}

