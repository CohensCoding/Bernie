'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PortfolioRow } from '@/lib/db/portfolio';
import { formatUsdFromCents } from '@/lib/money';

type SortKey =
  | 'createdAt'
  | 'player'
  | 'year'
  | 'brandSet'
  | 'grade'
  | 'grader'
  | 'purchasePrice'
  | 'totalCost'
  | 'purchaseDate'
  | 'sport'
  | 'team'
  | 'platform';

type SortDir = 'asc' | 'desc';

type ColumnKey =
  | 'thumb'
  | 'player'
  | 'year'
  | 'brandSet'
  | 'parallel'
  | 'grade'
  | 'grader'
  | 'platform'
  | 'purchasePrice'
  | 'totalCost'
  | 'purchaseDate'
  | 'sport'
  | 'team'
  | 'notes';

const COLUMN_STORAGE_KEY = 'bernie.cards.table.columns.v1';

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  thumb: true,
  player: true,
  year: true,
  brandSet: true,
  parallel: true,
  grade: true,
  grader: false,
  platform: true,
  purchasePrice: true,
  totalCost: true,
  purchaseDate: true,
  sport: true,
  team: true,
  notes: false,
};

const COLUMN_LABELS: Record<ColumnKey, string> = {
  thumb: 'Thumbnail',
  player: 'Player',
  year: 'Year',
  brandSet: 'Brand / set',
  parallel: 'Parallel',
  grade: 'Grade',
  grader: 'Grading company',
  platform: 'Platform',
  purchasePrice: 'Purchase',
  totalCost: 'Total cost',
  purchaseDate: 'Purchase date',
  sport: 'Sport',
  team: 'Team',
  notes: 'Notes',
};

function norm(s: string | null | undefined) {
  return (s ?? '').toString().trim().toLowerCase();
}

function normKey(s: string | null | undefined) {
  const t = (s ?? '').toString().trim();
  return t.length ? t : 'Unknown';
}

function brandSetLabel(c: PortfolioRow['card']) {
  const brand = normKey(c.brand);
  const set = normKey(c.set_name);
  return `${brand} · ${set}`;
}

function isNumbered(c: PortfolioRow['card']) {
  return (c.serial_number != null && c.serial_number > 0) || c.print_run != null;
}

function parseMoneyToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function loadColumnVisibility(): Record<ColumnKey, boolean> {
  if (typeof window === 'undefined') return { ...DEFAULT_VISIBLE };
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VISIBLE };
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>;
    const next = { ...DEFAULT_VISIBLE };
    for (const k of Object.keys(DEFAULT_VISIBLE) as ColumnKey[]) {
      if (typeof parsed[k] === 'boolean') next[k] = parsed[k]!;
    }
    return next;
  } catch {
    return { ...DEFAULT_VISIBLE };
  }
}

export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('All');
  const [player, setPlayer] = useState('All');
  const [team, setTeam] = useState('All');
  const [year, setYear] = useState('All');
  const [brandSet, setBrandSet] = useState('All');
  const [parallel, setParallel] = useState('All');
  const [grade, setGrade] = useState('All');
  const [grader, setGrader] = useState('All');
  const [platform, setPlatform] = useState('All');
  const [graded, setGraded] = useState<'All' | 'Graded' | 'Raw'>('All');
  const [autoF, setAutoF] = useState<'All' | 'Yes' | 'No'>('All');
  const [patchF, setPatchF] = useState<'All' | 'Yes' | 'No'>('All');
  const [numberedF, setNumberedF] = useState<'All' | 'Numbered' | 'Not numbered'>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [costMin, setCostMin] = useState('');
  const [costMax, setCostMax] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [confirmSingleDelete, setConfirmSingleDelete] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<ColumnKey, boolean>>(DEFAULT_VISIBLE);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkApplySport, setBulkApplySport] = useState(false);
  const [bulkSport, setBulkSport] = useState('');
  const [bulkApplyTeam, setBulkApplyTeam] = useState(false);
  const [bulkTeam, setBulkTeam] = useState('');

  useEffect(() => {
    setVisibleCols(loadColumnVisibility());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleCols));
  }, [visibleCols]);

  useEffect(() => {
    function onDoc() {
      setRowMenu(null);
    }
    if (rowMenu) {
      document.addEventListener('click', onDoc);
      return () => document.removeEventListener('click', onDoc);
    }
  }, [rowMenu]);

  const optionLists = useMemo(() => {
    const sports = new Set<string>();
    const players = new Set<string>();
    const teams = new Set<string>();
    const years = new Set<string>();
    const brandSets = new Set<string>();
    const parallels = new Set<string>();
    const grades = new Set<string>();
    const graders = new Set<string>();
    const platforms = new Set<string>();
    for (const r of rows) {
      const c = r.card;
      const t = r.latestTransaction;
      sports.add(normKey(c.sport));
      if ((c.player_name ?? '').trim()) players.add(c.player_name!.trim());
      if ((c.team ?? '').trim()) teams.add(c.team!.trim());
      if (c.year != null) years.add(String(c.year));
      brandSets.add(brandSetLabel(c));
      if ((c.parallel ?? '').trim()) parallels.add(c.parallel!.trim());
      if ((c.grade ?? '').trim()) grades.add(c.grade!.trim());
      if ((c.grading_company ?? '').trim()) graders.add(c.grading_company!.trim());
      if ((t?.platform ?? '').trim()) platforms.add(t!.platform!.trim());
    }
    const sortStr = (a: string, b: string) => a.localeCompare(b);
    return {
      sports: ['All', ...Array.from(sports).sort(sortStr)],
      players: ['All', ...Array.from(players).sort(sortStr)],
      teams: ['All', ...Array.from(teams).sort(sortStr)],
      years: ['All', ...Array.from(years).sort((a, b) => Number(a) - Number(b))],
      brandSets: ['All', ...Array.from(brandSets).sort(sortStr)],
      parallels: ['All', ...Array.from(parallels).sort(sortStr)],
      grades: ['All', ...Array.from(grades).sort(sortStr)],
      graders: ['All', ...Array.from(graders).sort(sortStr)],
      platforms: ['All', ...Array.from(platforms).sort(sortStr)],
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const tokens = norm(query)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const minC = parseMoneyToCents(costMin);
    const maxC = parseMoneyToCents(costMax);

    return rows.filter((r) => {
      const c = r.card;
      const t = r.latestTransaction;

      if (sport !== 'All' && normKey(c.sport) !== sport) return false;
      if (player !== 'All' && (c.player_name ?? '').trim() !== player) return false;
      if (team !== 'All' && (c.team ?? '').trim() !== team) return false;
      if (year !== 'All' && String(c.year ?? '') !== year) return false;
      if (brandSet !== 'All' && brandSetLabel(c) !== brandSet) return false;
      if (parallel !== 'All' && (c.parallel ?? '').trim() !== parallel) return false;
      if (grade !== 'All' && (c.grade ?? '').trim() !== grade) return false;
      if (grader !== 'All' && (c.grading_company ?? '').trim() !== grader) return false;
      if (platform !== 'All' && (t?.platform ?? '').trim() !== platform) return false;
      if (graded === 'Graded' && !c.graded) return false;
      if (graded === 'Raw' && c.graded) return false;
      if (autoF === 'Yes' && !c.auto) return false;
      if (autoF === 'No' && c.auto) return false;
      if (patchF === 'Yes' && !c.patch) return false;
      if (patchF === 'No' && c.patch) return false;
      if (numberedF === 'Numbered' && !isNumbered(c)) return false;
      if (numberedF === 'Not numbered' && isNumbered(c)) return false;

      const pd = t?.purchase_date ?? '';
      if (dateFrom && (!pd || pd < dateFrom)) return false;
      if (dateTo && (!pd || pd > dateTo)) return false;

      const total = t?.total_cost_cents ?? 0;
      if (minC != null && total < minC) return false;
      if (maxC != null && total > maxC) return false;

      if (tokens.length) {
        const hay = [
          c.player_name,
          c.team,
          c.sport,
          c.brand,
          c.set_name,
          c.parallel,
          c.grade,
          c.grading_company,
          c.notes,
          t?.platform,
        ]
          .map(norm)
          .join(' ');
        if (!tokens.every((tok) => hay.includes(tok))) return false;
      }
      return true;
    });
  }, [
    rows,
    query,
    sport,
    player,
    team,
    year,
    brandSet,
    parallel,
    grade,
    grader,
    platform,
    graded,
    autoF,
    patchF,
    numberedF,
    dateFrom,
    dateTo,
    costMin,
    costMax,
  ]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const get = (r: PortfolioRow) => {
      const c = r.card;
      const tx = r.latestTransaction;
      switch (sortKey) {
        case 'createdAt':
          return c.created_at ?? '';
        case 'player':
          return norm(c.player_name);
        case 'year':
          return c.year ?? -1;
        case 'brandSet':
          return brandSetLabel(c);
        case 'grade':
          return `${c.graded ? 1 : 0} ${norm(c.grading_company)} ${norm(c.grade)}`;
        case 'grader':
          return norm(c.grading_company);
        case 'purchasePrice':
          return tx?.purchase_price_cents ?? -1;
        case 'totalCost':
          return tx?.total_cost_cents ?? -1;
        case 'purchaseDate':
          return tx?.purchase_date ?? '';
        case 'sport':
          return norm(c.sport);
        case 'team':
          return norm(c.team);
        case 'platform':
          return norm(tx?.platform);
      }
    };
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = get(a) as string | number;
      const bv = get(b) as string | number;
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
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json?.error ?? 'Delete failed.');
  }

  function toggleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(next);
      setSortDir(next === 'player' || next === 'brandSet' || next === 'sport' || next === 'team' || next === 'grader' || next === 'platform' ? 'asc' : 'desc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-[10px] text-fg-muted">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  const navigateRow = useCallback(
    (cardId: string) => {
      router.push(`/cards/${cardId}`);
    },
    [router],
  );

  const visibleColCount =
    1 +
    (visibleCols.thumb ? 1 : 0) +
    (visibleCols.player ? 1 : 0) +
    (visibleCols.year ? 1 : 0) +
    (visibleCols.brandSet ? 1 : 0) +
    (visibleCols.parallel ? 1 : 0) +
    (visibleCols.grade ? 1 : 0) +
    (visibleCols.grader ? 1 : 0) +
    (visibleCols.platform ? 1 : 0) +
    (visibleCols.purchasePrice ? 1 : 0) +
    (visibleCols.totalCost ? 1 : 0) +
    (visibleCols.purchaseDate ? 1 : 0) +
    (visibleCols.sport ? 1 : 0) +
    (visibleCols.team ? 1 : 0) +
    (visibleCols.notes ? 1 : 0) +
    1;

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-bg-elevated/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-fg">
            <span className="font-semibold">{selectedIds.length}</span>{' '}
            <span className="text-fg-muted">selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                setBulkApplySport(false);
                setBulkApplyTeam(false);
                setBulkSport('');
                setBulkTeam('');
                setBulkError(null);
                setBulkEditOpen(true);
              }}
              className="rounded-xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-sm text-fg transition hover:bg-bg-muted/70"
            >
              Bulk edit…
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search (all words must match)…"
            className="w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg-muted outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <FilterSelect label="Sport" value={sport} onChange={setSport} options={optionLists.sports} />
            <FilterSelect label="Player" value={player} onChange={setPlayer} options={optionLists.players} />
            <FilterSelect label="Team" value={team} onChange={setTeam} options={optionLists.teams} />
            <FilterSelect label="Year" value={year} onChange={setYear} options={optionLists.years} />
            <FilterSelect
              label="Brand / set"
              value={brandSet}
              onChange={setBrandSet}
              options={optionLists.brandSets}
            />
            <FilterSelect label="Parallel" value={parallel} onChange={setParallel} options={optionLists.parallels} />
            <FilterSelect label="Grade" value={grade} onChange={setGrade} options={optionLists.grades} />
            <FilterSelect label="Grader" value={grader} onChange={setGrader} options={optionLists.graders} />
            <FilterSelect label="Platform" value={platform} onChange={setPlatform} options={optionLists.platforms} />
            <FilterSelect
              label="Slab"
              value={graded}
              onChange={(v) => setGraded(v as typeof graded)}
              options={['All', 'Graded', 'Raw']}
            />
            <FilterSelect label="Auto" value={autoF} onChange={(v) => setAutoF(v as typeof autoF)} options={['All', 'Yes', 'No']} />
            <FilterSelect label="Patch" value={patchF} onChange={(v) => setPatchF(v as typeof patchF)} options={['All', 'Yes', 'No']} />
            <FilterSelect
              label="Numbered"
              value={numberedF}
              onChange={(v) => setNumberedF(v as typeof numberedF)}
              options={['All', 'Numbered', 'Not numbered']}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">Purchase from</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl border border-border bg-bg-muted px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">Purchase to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl border border-border bg-bg-muted px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">Min cost ($)</span>
              <input
                value={costMin}
                onChange={(e) => setCostMin(e.target.value)}
                placeholder="0"
                className="w-28 rounded-xl border border-border bg-bg-muted px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">Max cost ($)</span>
              <input
                value={costMax}
                onChange={(e) => setCostMax(e.target.value)}
                placeholder="—"
                className="w-28 rounded-xl border border-border bg-bg-muted px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnsOpen((o) => !o)}
              className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none transition hover:bg-bg-muted/80 focus:ring-2 focus:ring-accent/40"
            >
              Columns
            </button>
            {columnsOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-bg-elevated p-3 shadow-xl">
                <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Visible</div>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={visibleCols[key]}
                        onChange={(e) => setVisibleCols((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      {COLUMN_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">Sort by</span>
            <select
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
                setSortKey(k);
                setSortDir(d);
              }}
              className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="createdAt:desc">Newest added</option>
              <option value="createdAt:asc">Oldest added</option>
              <option value="purchaseDate:desc">Purchase date (new)</option>
              <option value="purchaseDate:asc">Purchase date (old)</option>
              <option value="totalCost:desc">Total cost (high)</option>
              <option value="totalCost:asc">Total cost (low)</option>
              <option value="purchasePrice:desc">Purchase price (high)</option>
              <option value="purchasePrice:asc">Purchase price (low)</option>
              <option value="player:asc">Player (A–Z)</option>
              <option value="player:desc">Player (Z–A)</option>
              <option value="year:desc">Year (new)</option>
              <option value="year:asc">Year (old)</option>
              <option value="sport:asc">Sport</option>
              <option value="team:asc">Team</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-[980px] w-full border-separate border-spacing-0">
          <thead className="bg-bg-muted">
            <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => setAllVisible(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
              {visibleCols.thumb ? (
                <th className="px-2 py-3 w-14" onClick={(e) => e.stopPropagation()}>
                  Img
                </th>
              ) : null}
              {visibleCols.player ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('player')}>
                  Player{sortIndicator('player')}
                </th>
              ) : null}
              {visibleCols.year ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('year')}>
                  Year{sortIndicator('year')}
                </th>
              ) : null}
              {visibleCols.brandSet ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('brandSet')}>
                  Brand / Set{sortIndicator('brandSet')}
                </th>
              ) : null}
              {visibleCols.parallel ? <th className="px-4 py-3">Parallel</th> : null}
              {visibleCols.grade ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('grade')}>
                  Grade{sortIndicator('grade')}
                </th>
              ) : null}
              {visibleCols.grader ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('grader')}>
                  Grader{sortIndicator('grader')}
                </th>
              ) : null}
              {visibleCols.platform ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('platform')}>
                  Platform{sortIndicator('platform')}
                </th>
              ) : null}
              {visibleCols.purchasePrice ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('purchasePrice')}>
                  Purchase{sortIndicator('purchasePrice')}
                </th>
              ) : null}
              {visibleCols.totalCost ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('totalCost')}>
                  Total cost{sortIndicator('totalCost')}
                </th>
              ) : null}
              {visibleCols.purchaseDate ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('purchaseDate')}>
                  Date{sortIndicator('purchaseDate')}
                </th>
              ) : null}
              {visibleCols.sport ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('sport')}>
                  Sport{sortIndicator('sport')}
                </th>
              ) : null}
              {visibleCols.team ? (
                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('team')}>
                  Team{sortIndicator('team')}
                </th>
              ) : null}
              {visibleCols.notes ? <th className="px-4 py-3">Notes</th> : null}
              <th className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()} />
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
                  role="link"
                  tabIndex={0}
                  onClick={() => navigateRow(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigateRow(c.id);
                    }
                  }}
                  className="border-t border-border cursor-pointer hover:bg-bg-elevated/60"
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                    />
                  </td>
                  {visibleCols.thumb ? (
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      {r.thumb_signed_url ? (
                        <Link href={`/cards/${c.id}`} className="block h-11 w-11 overflow-hidden rounded-lg border border-border/80 bg-bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.thumb_signed_url} alt="" className="h-11 w-11 object-cover" />
                        </Link>
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border/60 text-[10px] text-fg-muted">
                          —
                        </div>
                      )}
                    </td>
                  ) : null}
                  {visibleCols.player ? (
                    <td className="px-4 py-3 text-sm text-fg">
                      <span className="font-medium hover:underline underline-offset-4">{c.player_name ?? 'Unknown'}</span>
                      {!visibleCols.brandSet ? (
                        <div className="mt-1 text-xs text-fg-muted">{c.set_name ?? ''}</div>
                      ) : null}
                    </td>
                  ) : null}
                  {visibleCols.year ? <td className="px-4 py-3 text-sm text-fg">{c.year ?? '—'}</td> : null}
                  {visibleCols.brandSet ? (
                    <td className="px-4 py-3 text-sm text-fg">
                      {c.brand ?? '—'}
                      <span className="text-fg-muted"> · </span>
                      {c.set_name ?? '—'}
                    </td>
                  ) : null}
                  {visibleCols.parallel ? <td className="px-4 py-3 text-sm text-fg">{c.parallel ?? '—'}</td> : null}
                  {visibleCols.grade ? <td className="px-4 py-3 text-sm text-fg">{gradeLabel}</td> : null}
                  {visibleCols.grader ? (
                    <td className="px-4 py-3 text-sm text-fg">{c.grading_company ?? '—'}</td>
                  ) : null}
                  {visibleCols.platform ? <td className="px-4 py-3 text-sm text-fg">{t?.platform ?? '—'}</td> : null}
                  {visibleCols.purchasePrice ? (
                    <td className="px-4 py-3 text-sm text-fg">{t ? formatUsdFromCents(t.purchase_price_cents) : '—'}</td>
                  ) : null}
                  {visibleCols.totalCost ? (
                    <td className="px-4 py-3 text-sm text-fg">{t ? formatUsdFromCents(t.total_cost_cents) : '—'}</td>
                  ) : null}
                  {visibleCols.purchaseDate ? (
                    <td className="px-4 py-3 text-sm text-fg">{t?.purchase_date ?? '—'}</td>
                  ) : null}
                  {visibleCols.sport ? <td className="px-4 py-3 text-sm text-fg">{c.sport ?? '—'}</td> : null}
                  {visibleCols.team ? <td className="px-4 py-3 text-sm text-fg">{c.team ?? '—'}</td> : null}
                  {visibleCols.notes ? (
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-fg-muted" title={c.notes ?? ''}>
                      {c.notes?.trim() ? c.notes : '—'}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowMenu((cur) => (cur === c.id ? null : c.id));
                        }}
                        className="rounded-lg border border-border/70 bg-bg-muted/40 px-2 py-1 text-xs text-fg-muted hover:text-fg hover:bg-bg-elevated/60"
                        aria-label="Row actions"
                      >
                        ⋯
                      </button>
                      {rowMenu === c.id ? (
                        <div
                          className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                              router.push(`/cards/${c.id}/edit`);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted/60"
                          >
                            Edit
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
                <td className="px-4 py-8 text-center text-sm text-fg-muted" colSpan={visibleColCount}>
                  No results.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-fg-muted">
        Showing <span className="text-fg">{sorted.length}</span> of <span className="text-fg">{rows.length}</span>
      </div>

      {bulkEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold text-fg">Bulk edit {selectedIds.length} card(s)</div>
            <div className="mt-2 text-sm text-fg-muted">Check a field to update it on every selected card. Leave the value empty to clear.</div>
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={bulkApplySport}
                  onChange={(e) => setBulkApplySport(e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fg-muted">Sport</span>
                  <input
                    value={bulkSport}
                    onChange={(e) => setBulkSport(e.target.value)}
                    disabled={!bulkApplySport}
                    className="mt-1 w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                  />
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={bulkApplyTeam}
                  onChange={(e) => setBulkApplyTeam(e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fg-muted">Team</span>
                  <input
                    value={bulkTeam}
                    onChange={(e) => setBulkTeam(e.target.value)}
                    disabled={!bulkApplyTeam}
                    className="mt-1 w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                  />
                </span>
              </label>
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
                onClick={() => setBulkEditOpen(false)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2 text-sm text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy || (!bulkApplySport && !bulkApplyTeam)}
                onClick={async () => {
                  setBulkBusy(true);
                  setBulkError(null);
                  try {
                    const patch: { sport?: string | null; team?: string | null } = {};
                    if (bulkApplySport) patch.sport = bulkSport.trim() || null;
                    if (bulkApplyTeam) patch.team = bulkTeam.trim() || null;
                    if (Object.keys(patch).length === 0) {
                      setBulkError('Select at least one field to update.');
                      return;
                    }
                    const res = await fetch('/api/cards/bulk-patch', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ card_ids: selectedIds, patch }),
                    });
                    const json = (await res.json()) as { error?: string };
                    if (!res.ok) throw new Error(json?.error ?? 'Update failed.');
                    setBulkEditOpen(false);
                    setBulkApplySport(false);
                    setBulkApplyTeam(false);
                    setBulkSport('');
                    setBulkTeam('');
                    router.refresh();
                  } catch (e) {
                    setBulkError(e instanceof Error ? e.message : 'Update failed.');
                  } finally {
                    setBulkBusy(false);
                  }
                }}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-95 disabled:opacity-50"
              >
                {bulkBusy ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 rounded-xl border border-border bg-bg-muted px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
