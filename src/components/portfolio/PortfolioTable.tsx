'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

function normKey(s: string | null | undefined) {
  const t = (s ?? '').toString().trim();
  return t.length ? t : 'Unknown';
}

export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('All');
  const [graded, setGraded] = useState<'All' | 'Graded' | 'Raw'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [confirmSingleDelete, setConfirmSingleDelete] = useState<string | null>(null);

  const sports = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(normKey(r.card.sport));
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((r) => {
      if (sport !== 'All' && normKey(r.card.sport) !== sport) return false;
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

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const allVisibleSelected = useMemo(
    () => sorted.length > 0 && sorted.every((r) => selected[r.card.id]),
    [sorted, selected],
  );

  function setAllVisible(next: boolean) {
    const copy = { ...selected };
    for (const r of sorted) copy[r.card.id] = next;
    setSelected(copy);
  }

  async function deleteCards(cardIds: string[]) {
    const res = await fetch('/api/cards/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ card_ids: cardIds }),
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error ?? 'Delete failed.');
  }

  function toggleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(next);
      setSortDir('desc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-[10px] text-fg-muted">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-bg-elevated/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-fg">
            <span className="font-semibold">{selectedIds.length}</span>{' '}
            <span className="text-fg-muted">selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected({})}
              className="rounded-xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-sm text-fg transition hover:bg-bg-muted/70"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkError(null);
                setConfirmBulkDelete(true);
              }}
              className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/[0.1]"
            >
              Delete selected
            </button>
          </div>
        </div>
      ) : null}

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
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => setAllVisible(e.target.checked)}
                />
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('player')}>
                Player{sortIndicator('player')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('year')}>
                Year{sortIndicator('year')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('brandSet')}>
                Brand / Set{sortIndicator('brandSet')}
              </th>
              <th className="px-4 py-3">Parallel</th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('grade')}>
                Grade{sortIndicator('grade')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('purchasePrice')}>
                Purchase{sortIndicator('purchasePrice')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('totalCost')}>
                Total cost{sortIndicator('totalCost')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('purchaseDate')}>
                Date{sortIndicator('purchaseDate')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('sport')}>
                Sport{sortIndicator('sport')}
              </th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('team')}>
                Team{sortIndicator('team')}
              </th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const c = r.card;
              const t = r.latestTransaction;
              const gradeLabel = c.graded ? `${c.grading_company ?? ''} ${c.grade ?? ''}`.trim() : 'Raw';
              const isSelected = Boolean(selected[c.id]);
              return (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-bg-elevated/60"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-fg">
                    <Link href={`/cards/${c.id}`} className="hover:underline underline-offset-4 font-medium">
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
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setRowMenu((cur) => (cur === c.id ? null : c.id))}
                        className="rounded-lg border border-border/70 bg-bg-muted/40 px-2 py-1 text-xs text-fg-muted hover:text-fg hover:bg-bg-elevated/60"
                        aria-label="Row actions"
                      >
                        ⋯
                      </button>
                      {rowMenu === c.id ? (
                        <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setRowMenu(null);
                              router.push(`/cards/${c.id}`);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted/60"
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRowMenu(null);
                              setConfirmSingleDelete(c.id);
                              setBulkError(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/[0.08]"
                          >
                            Delete…
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-fg-muted" colSpan={12}>
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

      {confirmBulkDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold text-fg">Delete {selectedIds.length} card(s)?</div>
            <div className="mt-2 text-sm text-fg-muted">
              This removes selected cards and their linked screenshots and transactions. This can’t be undone.
            </div>
            {bulkError ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
                {bulkError}
              </div>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setConfirmBulkDelete(false)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2 text-sm text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={async () => {
                  setBulkBusy(true);
                  setBulkError(null);
                  try {
                    await deleteCards(selectedIds);
                    setConfirmBulkDelete(false);
                    setSelected({});
                    router.refresh();
                  } catch (e) {
                    setBulkError(e instanceof Error ? e.message : 'Delete failed.');
                  } finally {
                    setBulkBusy(false);
                  }
                }}
                className="rounded-xl bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {bulkBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmSingleDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold text-fg">Delete this card?</div>
            <div className="mt-2 text-sm text-fg-muted">This can’t be undone.</div>
            {bulkError ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
                {bulkError}
              </div>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setConfirmSingleDelete(null)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2 text-sm text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={async () => {
                  setBulkBusy(true);
                  setBulkError(null);
                  try {
                    await deleteCards([confirmSingleDelete]);
                    setConfirmSingleDelete(null);
                    setSelected((prev) => {
                      const copy = { ...prev };
                      delete copy[confirmSingleDelete];
                      return copy;
                    });
                    router.refresh();
                  } catch (e) {
                    setBulkError(e instanceof Error ? e.message : 'Delete failed.');
                  } finally {
                    setBulkBusy(false);
                  }
                }}
                className="rounded-xl bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {bulkBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

