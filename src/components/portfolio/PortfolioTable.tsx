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

const COLUMN_STORAGE_KEY = 'bernie.cards.table.columns.v2';

/** Calm default: scan-friendly inventory columns. */
const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  thumb: true,
  player: true,
  year: true,
  brandSet: true,
  parallel: false,
  grade: true,
  grader: false,
  platform: false,
  purchasePrice: true,
  totalCost: true,
  purchaseDate: true,
  sport: false,
  team: false,
  notes: false,
};

const COLUMN_LABELS: Record<ColumnKey, string> = {
  thumb: 'Image',
  player: 'Player',
  year: 'Year',
  brandSet: 'Set',
  parallel: 'Parallel',
  grade: 'Grade',
  grader: 'Grading company',
  platform: 'Platform',
  purchasePrice: 'Purchase',
  totalCost: 'Total cost',
  purchaseDate: 'Date',
  sport: 'Sport',
  team: 'Team',
  notes: 'Notes',
};

const MOBILE_PRIMARY: Record<ColumnKey, boolean> = {
  thumb: true,
  player: true,
  year: true,
  brandSet: true,
  parallel: false,
  grade: true,
  grader: false,
  platform: false,
  purchasePrice: false,
  totalCost: true,
  purchaseDate: true,
  sport: false,
  team: false,
  notes: false,
};

const VIEW_STORAGE_KEY = 'bernie.cards.viewMode.v1';

type ViewMode = 'table' | 'grid';

type GradedFilter = 'All' | 'Graded' | 'Raw';
type Tri = 'All' | 'Yes' | 'No';
type NumberedFilter = 'All' | 'Numbered' | 'Not numbered';

type FilterState = {
  sport: string;
  player: string;
  team: string;
  year: string;
  brandSet: string;
  parallel: string;
  grade: string;
  grader: string;
  platform: string;
  graded: GradedFilter;
  autoF: Tri;
  patchF: Tri;
  numberedF: NumberedFilter;
  dateFrom: string;
  dateTo: string;
  costMin: string;
  costMax: string;
};

const EMPTY_FILTERS: FilterState = {
  sport: 'All',
  player: 'All',
  team: 'All',
  year: 'All',
  brandSet: 'All',
  parallel: 'All',
  grade: 'All',
  grader: 'All',
  platform: 'All',
  graded: 'All',
  autoF: 'All',
  patchF: 'All',
  numberedF: 'All',
  dateFrom: '',
  dateTo: '',
  costMin: '',
  costMax: '',
};

type ChipId = keyof FilterState;

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

function setDisplayLabel(c: PortfolioRow['card']) {
  const b = (c.brand ?? '').trim();
  const s = (c.set_name ?? '').trim();
  if (b && s) return `${b} · ${s}`;
  return b || s || '—';
}

function gradeLabelFor(c: PortfolioRow['card']) {
  return c.graded ? `${c.grading_company ?? ''} ${c.grade ?? ''}`.trim() || 'Graded' : 'Raw';
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

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'table';
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === 'grid' ? 'grid' : 'table';
}

function countAppliedFilters(f: FilterState): number {
  let n = 0;
  if (f.sport !== 'All') n++;
  if (f.player !== 'All') n++;
  if (f.team !== 'All') n++;
  if (f.year !== 'All') n++;
  if (f.brandSet !== 'All') n++;
  if (f.parallel !== 'All') n++;
  if (f.grade !== 'All') n++;
  if (f.grader !== 'All') n++;
  if (f.platform !== 'All') n++;
  if (f.graded !== 'All') n++;
  if (f.autoF !== 'All') n++;
  if (f.patchF !== 'All') n++;
  if (f.numberedF !== 'All') n++;
  if (f.dateFrom) n++;
  if (f.dateTo) n++;
  if (f.costMin.trim()) n++;
  if (f.costMax.trim()) n++;
  return n;
}

function chipForFilter(id: ChipId, f: FilterState): { id: ChipId; label: string } | null {
  switch (id) {
    case 'sport':
      return f.sport !== 'All' ? { id, label: `Sport: ${f.sport}` } : null;
    case 'player':
      return f.player !== 'All' ? { id, label: `Player: ${f.player}` } : null;
    case 'team':
      return f.team !== 'All' ? { id, label: `Team: ${f.team}` } : null;
    case 'year':
      return f.year !== 'All' ? { id, label: `Year: ${f.year}` } : null;
    case 'brandSet':
      return f.brandSet !== 'All' ? { id, label: `Set: ${f.brandSet}` } : null;
    case 'parallel':
      return f.parallel !== 'All' ? { id, label: `Parallel: ${f.parallel}` } : null;
    case 'grade':
      return f.grade !== 'All' ? { id, label: `Grade: ${f.grade}` } : null;
    case 'grader':
      return f.grader !== 'All' ? { id, label: `Grader: ${f.grader}` } : null;
    case 'platform':
      return f.platform !== 'All' ? { id, label: `Platform: ${f.platform}` } : null;
    case 'graded':
      return f.graded !== 'All' ? { id, label: f.graded === 'Graded' ? 'Slab: graded' : 'Slab: raw' } : null;
    case 'autoF':
      return f.autoF !== 'All' ? { id, label: `Auto: ${f.autoF}` } : null;
    case 'patchF':
      return f.patchF !== 'All' ? { id, label: `Patch: ${f.patchF}` } : null;
    case 'numberedF':
      return f.numberedF !== 'All' ? { id, label: `Numbered: ${f.numberedF === 'Numbered' ? 'yes' : 'no'}` } : null;
    case 'dateFrom':
      return f.dateFrom ? { id, label: `From ${f.dateFrom}` } : null;
    case 'dateTo':
      return f.dateTo ? { id, label: `To ${f.dateTo}` } : null;
    case 'costMin':
      return f.costMin.trim() ? { id, label: `Min $${f.costMin.trim()}` } : null;
    case 'costMax':
      return f.costMax.trim() ? { id, label: `Max $${f.costMax.trim()}` } : null;
    default:
      return null;
  }
}

function clearFilterChip(prev: FilterState, id: ChipId): FilterState {
  const next = { ...prev };
  switch (id) {
    case 'dateFrom':
    case 'dateTo':
    case 'costMin':
    case 'costMax':
      next[id] = '';
      break;
    case 'graded':
      next.graded = 'All';
      break;
    case 'autoF':
      next.autoF = 'All';
      break;
    case 'patchF':
      next.patchF = 'All';
      break;
    case 'numberedF':
      next.numberedF = 'All';
      break;
    case 'sport':
      next.sport = 'All';
      break;
    case 'player':
      next.player = 'All';
      break;
    case 'team':
      next.team = 'All';
      break;
    case 'year':
      next.year = 'All';
      break;
    case 'brandSet':
      next.brandSet = 'All';
      break;
    case 'parallel':
      next.parallel = 'All';
      break;
    case 'grade':
      next.grade = 'All';
      break;
    case 'grader':
      next.grader = 'All';
      break;
    case 'platform':
      next.platform = 'All';
      break;
  }
  return next;
}

export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('purchaseDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
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
    setViewMode(loadViewMode());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleCols));
  }, [visibleCols]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    function onDoc() {
      setRowMenu(null);
    }
    if (rowMenu) {
      document.addEventListener('click', onDoc);
      return () => document.removeEventListener('click', onDoc);
    }
  }, [rowMenu]);

  useEffect(() => {
    function onDoc() {
      setColumnsOpen(false);
    }
    if (columnsOpen) {
      document.addEventListener('click', onDoc);
      return () => document.removeEventListener('click', onDoc);
    }
  }, [columnsOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFilterOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filterOpen]);

  useEffect(() => {
    if (filterOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [filterOpen]);

  const filterCount = useMemo(() => countAppliedFilters(applied), [applied]);

  const chips = useMemo(() => {
    const ids = Object.keys(EMPTY_FILTERS) as ChipId[];
    const out: { id: ChipId; label: string }[] = [];
    for (const id of ids) {
      const c = chipForFilter(id, applied);
      if (c) out.push(c);
    }
    return out;
  }, [applied]);

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
    const f = applied;
    const tokens = norm(query)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const minC = parseMoneyToCents(f.costMin);
    const maxC = parseMoneyToCents(f.costMax);

    return rows.filter((r) => {
      const c = r.card;
      const t = r.latestTransaction;

      if (f.sport !== 'All' && normKey(c.sport) !== f.sport) return false;
      if (f.player !== 'All' && (c.player_name ?? '').trim() !== f.player) return false;
      if (f.team !== 'All' && (c.team ?? '').trim() !== f.team) return false;
      if (f.year !== 'All' && String(c.year ?? '') !== f.year) return false;
      if (f.brandSet !== 'All' && brandSetLabel(c) !== f.brandSet) return false;
      if (f.parallel !== 'All' && (c.parallel ?? '').trim() !== f.parallel) return false;
      if (f.grade !== 'All' && (c.grade ?? '').trim() !== f.grade) return false;
      if (f.grader !== 'All' && (c.grading_company ?? '').trim() !== f.grader) return false;
      if (f.platform !== 'All' && (t?.platform ?? '').trim() !== f.platform) return false;
      if (f.graded === 'Graded' && !c.graded) return false;
      if (f.graded === 'Raw' && c.graded) return false;
      if (f.autoF === 'Yes' && !c.auto) return false;
      if (f.autoF === 'No' && c.auto) return false;
      if (f.patchF === 'Yes' && !c.patch) return false;
      if (f.patchF === 'No' && c.patch) return false;
      if (f.numberedF === 'Numbered' && !isNumbered(c)) return false;
      if (f.numberedF === 'Not numbered' && isNumbered(c)) return false;

      const pd = t?.purchase_date ?? '';
      if (f.dateFrom && (!pd || pd < f.dateFrom)) return false;
      if (f.dateTo && (!pd || pd > f.dateTo)) return false;

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
  }, [rows, query, applied]);

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
    const cleaned = cardIds.map((id) => String(id)).filter((id) => id && id !== 'null' && id !== 'undefined');
    if (cleaned.length === 0) throw new Error('No card ids to delete.');
    const res = await fetch('/api/cards/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ card_ids: cleaned }),
    });
    const json = (await res.json()) as { error?: string; issues?: Array<{ path: unknown; message: string }> };
    if (!res.ok) {
      const issueHint =
        json?.issues && json.issues.length ? ` (${json.issues.map((i) => i.message).join(', ')})` : '';
      throw new Error((json?.error ?? 'Delete failed.') + issueHint);
    }
  }

  function toggleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(next);
      setSortDir(
        next === 'player' || next === 'brandSet' || next === 'sport' || next === 'team' || next === 'grader' || next === 'platform'
          ? 'asc'
          : 'desc',
      );
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

  function openFilters() {
    setDraft({ ...applied });
    setFilterOpen(true);
  }

  return (
    <div className={`space-y-4 ${selectedIds.length > 0 ? 'pb-20 sm:pb-0' : ''}`}>
      {/* Primary toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-border/80 bg-bg-muted/50 px-4 text-sm text-fg placeholder:text-fg-muted/80 outline-none ring-accent/30 transition focus:ring-2"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
              setSortKey(k);
              setSortDir(d);
            }}
            className="h-11 min-w-[10rem] rounded-2xl border border-border/80 bg-bg-muted/50 px-4 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="createdAt:desc">Newest added</option>
            <option value="createdAt:asc">Oldest added</option>
            <option value="purchaseDate:desc">Purchase date (new)</option>
            <option value="purchaseDate:asc">Purchase date (old)</option>
            <option value="totalCost:desc">Total cost (high)</option>
            <option value="totalCost:asc">Total cost (low)</option>
            <option value="purchasePrice:desc">Purchase (high)</option>
            <option value="purchasePrice:asc">Purchase (low)</option>
            <option value="player:asc">Player (A–Z)</option>
            <option value="player:desc">Player (Z–A)</option>
            <option value="year:desc">Year (new)</option>
            <option value="year:asc">Year (old)</option>
            <option value="sport:asc">Sport</option>
            <option value="team:asc">Team</option>
          </select>

          <button
            type="button"
            onClick={openFilters}
            className="h-11 rounded-2xl border border-border/80 bg-bg-muted/50 px-4 text-sm font-medium text-fg transition hover:bg-bg-muted/80"
          >
            Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setColumnsOpen((o) => !o);
              }}
              className="h-11 rounded-2xl border border-border/80 bg-bg-muted/50 px-4 text-sm font-medium text-fg transition hover:bg-bg-muted/80"
            >
              Columns
            </button>
            {columnsOpen ? (
              <div
                className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-border bg-bg-elevated p-3 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
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

          <div className="flex h-11 rounded-2xl border border-border/80 bg-bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`rounded-xl px-3 text-xs font-semibold transition sm:text-sm ${
                viewMode === 'table' ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-xl px-3 text-xs font-semibold transition sm:text-sm ${
                viewMode === 'grid' ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              Grid
            </button>
          </div>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setApplied((prev) => clearFilterChip(prev, c.id))}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-bg-muted/40 py-1 pl-2.5 pr-2 text-xs text-fg transition hover:bg-bg-muted/70"
            >
              <span>{c.label}</span>
              <span className="text-fg-muted">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setApplied({ ...EMPTY_FILTERS })}
            className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Desktop/tablet contextual bar (keeps layout consistent) */}
      {selectedIds.length > 0 ? (
        <div className="hidden rounded-2xl border border-accent/25 bg-accent/[0.06] px-3 py-3 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <div className="text-sm font-medium text-fg">
              {selectedIds.length} <span className="text-fg-muted">selected</span>
            </div>
            <button
              type="button"
              onClick={() => setSelected({})}
              className="rounded-xl border border-border/60 bg-bg-muted/35 px-3 py-2 text-sm text-fg transition hover:bg-bg-muted/60"
            >
              Clear
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:items-center sm:gap-2">
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
              className="rounded-xl border border-border/60 bg-bg-muted/40 px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-muted/70"
            >
              Bulk edit
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkError(null);
                setConfirmBulkDelete(true);
              }}
              className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/[0.11]"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {viewMode === 'grid' ? (
        sorted.length === 0 ? (
          <div className="rounded-xl border border-border/60 py-16 text-center text-sm text-fg-muted">No results.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sorted.map((r) => {
              const c = r.card;
              const t = r.latestTransaction;
              const gradeLabel = c.graded ? `${c.grading_company ?? ''} ${c.grade ?? ''}`.trim() : 'Raw';
              const isSelected = Boolean(selected[c.id]);
              return (
                <div
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
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-border/70 bg-bg-elevated/40 transition hover:border-border hover:bg-bg-elevated/70"
                >
                  <div className="relative aspect-[4/5] bg-bg-muted/50">
                    <label
                      className="absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-bg-elevated/90 shadow-sm backdrop-blur"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }));
                        }}
                        className="h-3.5 w-3.5 rounded border-border"
                        aria-label={isSelected ? 'Deselect' : 'Select'}
                      />
                    </label>
                    {r.thumb_signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumb_signed_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">No image</div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="truncate text-sm font-medium text-fg">{c.player_name ?? 'Unknown'}</div>
                    <div className="truncate text-xs text-fg-muted">{c.year ?? '—'} · {setDisplayLabel(c)}</div>
                    <div className="truncate text-xs text-fg-muted">{gradeLabel}</div>
                    <div className="text-sm font-medium tabular-nums text-fg">
                      {t ? formatUsdFromCents(t.total_cost_cents) : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <>
          {/* Mobile-first list layout (true table becomes desktop-only). */}
          <div className="sm:hidden">
            {sorted.length === 0 ? (
              <div className="rounded-xl border border-border/60 py-12 text-center text-sm text-fg-muted">No results.</div>
            ) : (
              <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/70 bg-bg-elevated/30">
                {sorted.map((r) => {
                  const c = r.card;
                  const t = r.latestTransaction;
                  const isSelected = Boolean(selected[c.id]);
                  return (
                    <div
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
                      className="flex items-start gap-3 px-3 py-3 transition hover:bg-bg-elevated/50"
                    >
                      <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                          className="h-4 w-4"
                          aria-label={isSelected ? 'Deselect card' : 'Select card'}
                        />
                      </div>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        {r.thumb_signed_url ? (
                          <Link
                            href={`/cards/${c.id}`}
                            className="block h-12 w-12 overflow-hidden rounded-xl border border-border/60 bg-bg-muted"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.thumb_signed_url} alt="" className="h-12 w-12 object-cover" />
                          </Link>
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-border/50 text-[10px] text-fg-muted">
                            —
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-fg">{c.player_name ?? 'Unknown'}</div>
                            <div className="mt-0.5 truncate text-xs text-fg-muted">
                              {c.year ?? '—'} · {setDisplayLabel(c)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold tabular-nums text-fg">
                              {t ? formatUsdFromCents(t.total_cost_cents) : '—'}
                            </div>
                            <div className="mt-0.5 text-xs tabular-nums text-fg-muted">{t?.purchase_date ?? ''}</div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-xs text-fg-muted">{gradeLabelFor(c)}</div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRowMenu((cur) => (cur === c.id ? null : c.id));
                            }}
                            className="rounded-lg border border-border/60 bg-bg-muted/35 px-2.5 py-1.5 text-xs font-medium text-fg transition hover:bg-bg-muted/60"
                            aria-label="Row actions"
                          >
                            ⋯
                          </button>
                        </div>

                        {rowMenu === c.id ? (
                          <div className="mt-2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setRowMenu(null);
                                router.push(`/cards/${c.id}`);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg-muted/60"
                            >
                              View
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop/tablet table layout */}
          <div className="hidden sm:block max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border/80">
            <table className="min-w-[980px] w-full table-auto border-separate border-spacing-0">
            <thead className="bg-bg-muted/50">
              <tr className="text-left text-[10px] uppercase tracking-wide text-fg-muted/90">
                  <th className="px-3 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => setAllVisible(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                {visibleCols.thumb ? (
                  <th className="px-2 py-2.5 w-14" onClick={(e) => e.stopPropagation()}>
                    {/* image */}
                  </th>
                ) : null}
                {visibleCols.player ? (
                  <th className="px-3 py-2.5 cursor-pointer text-fg-muted" onClick={() => toggleSort('player')}>
                    Player{sortIndicator('player')}
                  </th>
                ) : null}
                {visibleCols.year ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.year ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('year')}
                  >
                    Year{sortIndicator('year')}
                  </th>
                ) : null}
                {visibleCols.brandSet ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.brandSet ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('brandSet')}
                  >
                    Set{sortIndicator('brandSet')}
                  </th>
                ) : null}
                {visibleCols.parallel ? (
                  <th className={`px-3 py-2.5 ${MOBILE_PRIMARY.parallel ? '' : 'hidden sm:table-cell'}`}>Parallel</th>
                ) : null}
                {visibleCols.grade ? (
                  <th className="px-3 py-2.5 cursor-pointer" onClick={() => toggleSort('grade')}>
                    Grade{sortIndicator('grade')}
                  </th>
                ) : null}
                {visibleCols.grader ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.grader ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('grader')}
                  >
                    Grader{sortIndicator('grader')}
                  </th>
                ) : null}
                {visibleCols.platform ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.platform ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('platform')}
                  >
                    Platform{sortIndicator('platform')}
                  </th>
                ) : null}
                {visibleCols.purchasePrice ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.purchasePrice ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('purchasePrice')}
                  >
                    Purchase{sortIndicator('purchasePrice')}
                  </th>
                ) : null}
                {visibleCols.totalCost ? (
                  <th className="px-3 py-2.5 cursor-pointer" onClick={() => toggleSort('totalCost')}>
                    Total{sortIndicator('totalCost')}
                  </th>
                ) : null}
                {visibleCols.purchaseDate ? (
                  <th className="px-3 py-2.5 cursor-pointer" onClick={() => toggleSort('purchaseDate')}>
                    Date{sortIndicator('purchaseDate')}
                  </th>
                ) : null}
                {visibleCols.sport ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.sport ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('sport')}
                  >
                    Sport{sortIndicator('sport')}
                  </th>
                ) : null}
                {visibleCols.team ? (
                  <th
                    className={`px-3 py-2.5 cursor-pointer ${MOBILE_PRIMARY.team ? '' : 'hidden sm:table-cell'}`}
                    onClick={() => toggleSort('team')}
                  >
                    Team{sortIndicator('team')}
                  </th>
                ) : null}
                {visibleCols.notes ? (
                  <th className={`px-3 py-2.5 ${MOBILE_PRIMARY.notes ? '' : 'hidden sm:table-cell'}`}>Notes</th>
                ) : null}
                <th className="px-3 py-2.5 w-10" onClick={(e) => e.stopPropagation()} />
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
                    className="border-t border-border/60 cursor-pointer hover:bg-bg-elevated/50"
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                      />
                    </td>
                    {visibleCols.thumb ? (
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {r.thumb_signed_url ? (
                          <Link
                            href={`/cards/${c.id}`}
                            className="block h-10 w-10 overflow-hidden rounded-lg border border-border/60 bg-bg-muted"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.thumb_signed_url} alt="" className="h-10 w-10 object-cover" />
                          </Link>
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border/50 text-[10px] text-fg-muted">
                            —
                          </div>
                        )}
                      </td>
                    ) : null}
                    {visibleCols.player ? (
                      <td className="px-3 py-2.5 text-sm text-fg">
                        <span className="font-medium">{c.player_name ?? 'Unknown'}</span>
                        {!visibleCols.brandSet ? (
                          <div className="mt-0.5 truncate text-xs text-fg-muted">{setDisplayLabel(c)}</div>
                        ) : null}
                      </td>
                    ) : null}
                {visibleCols.year ? (
                    <td className={`px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.year ? '' : 'hidden sm:table-cell'}`}>
                    {c.year ?? '—'}
                  </td>
                ) : null}
                    {visibleCols.brandSet ? (
                    <td
                    className={`truncate px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.brandSet ? '' : 'hidden sm:table-cell'}`}
                  >
                    {setDisplayLabel(c)}
                  </td>
                    ) : null}
                    {visibleCols.parallel ? (
                  <td
                    className={`max-w-[120px] truncate px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.parallel ? '' : 'hidden sm:table-cell'}`}
                  >
                    {c.parallel ?? '—'}
                  </td>
                    ) : null}
                    {visibleCols.grade ? <td className="px-3 py-2.5 text-sm text-fg">{gradeLabel}</td> : null}
                    {visibleCols.grader ? (
                  <td
                    className={`px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.grader ? '' : 'hidden sm:table-cell'}`}
                  >
                    {c.grading_company ?? '—'}
                  </td>
                    ) : null}
                {visibleCols.platform ? (
                  <td
                    className={`px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.platform ? '' : 'hidden sm:table-cell'}`}
                  >
                    {t?.platform ?? '—'}
                  </td>
                ) : null}
                    {visibleCols.purchasePrice ? (
                  <td
                    className={`px-3 py-2.5 text-sm tabular-nums text-fg ${MOBILE_PRIMARY.purchasePrice ? '' : 'hidden sm:table-cell'}`}
                  >
                        {t ? formatUsdFromCents(t.purchase_price_cents) : '—'}
                      </td>
                    ) : null}
                    {visibleCols.totalCost ? (
                    <td className="px-3 py-2.5 text-sm tabular-nums text-fg whitespace-nowrap">
                        {t ? formatUsdFromCents(t.total_cost_cents) : '—'}
                      </td>
                    ) : null}
                    {visibleCols.purchaseDate ? (
                    <td className="px-3 py-2.5 text-sm tabular-nums text-fg whitespace-nowrap">{t?.purchase_date ?? '—'}</td>
                    ) : null}
                {visibleCols.sport ? (
                  <td className={`px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.sport ? '' : 'hidden sm:table-cell'}`}>
                    {c.sport ?? '—'}
                  </td>
                ) : null}
                {visibleCols.team ? (
                  <td className={`px-3 py-2.5 text-sm text-fg ${MOBILE_PRIMARY.team ? '' : 'hidden sm:table-cell'}`}>
                    {c.team ?? '—'}
                  </td>
                ) : null}
                    {visibleCols.notes ? (
                  <td
                    className={`max-w-[160px] truncate px-3 py-2.5 text-sm text-fg-muted ${MOBILE_PRIMARY.notes ? '' : 'hidden sm:table-cell'}`}
                    title={c.notes ?? ''}
                  >
                        {c.notes?.trim() ? c.notes : '—'}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRowMenu((cur) => (cur === c.id ? null : c.id));
                          }}
                          className="rounded-md border border-border/60 bg-bg-muted/40 px-2 py-1 text-xs text-fg-muted hover:text-fg"
                          aria-label="Row actions"
                        >
                          ⋯
                        </button>
                        {rowMenu === c.id ? (
                          <div
                            className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl"
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
                              View
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
                  <td className="px-4 py-10 text-center text-sm text-fg-muted" colSpan={visibleColCount}>
                    No results.
                  </td>
                </tr>
              ) : null}
            </tbody>
            </table>
          </div>
        </>
      )}

      <div className="text-xs text-fg-muted">
        Showing <span className="text-fg">{sorted.length}</span> of <span className="text-fg">{rows.length}</span>
      </div>

      {/* Filter slide-over */}
      {filterOpen ? (
        <>
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] transition"
            onClick={() => setFilterOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg-elevated shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-fg">Filters</div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted/50 hover:text-fg"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FilterSelect label="Sport" value={draft.sport} onChange={(v) => setDraft((d) => ({ ...d, sport: v }))} options={optionLists.sports} />
                <FilterSelect label="Player" value={draft.player} onChange={(v) => setDraft((d) => ({ ...d, player: v }))} options={optionLists.players} />
                <FilterSelect label="Team" value={draft.team} onChange={(v) => setDraft((d) => ({ ...d, team: v }))} options={optionLists.teams} />
                <FilterSelect label="Year" value={draft.year} onChange={(v) => setDraft((d) => ({ ...d, year: v }))} options={optionLists.years} />
                <FilterSelect
                  label="Brand / set"
                  value={draft.brandSet}
                  onChange={(v) => setDraft((d) => ({ ...d, brandSet: v }))}
                  options={optionLists.brandSets}
                />
                <FilterSelect label="Parallel" value={draft.parallel} onChange={(v) => setDraft((d) => ({ ...d, parallel: v }))} options={optionLists.parallels} />
                <FilterSelect label="Grade" value={draft.grade} onChange={(v) => setDraft((d) => ({ ...d, grade: v }))} options={optionLists.grades} />
                <FilterSelect label="Grader" value={draft.grader} onChange={(v) => setDraft((d) => ({ ...d, grader: v }))} options={optionLists.graders} />
                <FilterSelect label="Platform" value={draft.platform} onChange={(v) => setDraft((d) => ({ ...d, platform: v }))} options={optionLists.platforms} />
                <FilterSelect
                  label="Slab"
                  value={draft.graded}
                  onChange={(v) => setDraft((d) => ({ ...d, graded: v as GradedFilter }))}
                  options={['All', 'Graded', 'Raw']}
                />
                <FilterSelect label="Auto" value={draft.autoF} onChange={(v) => setDraft((d) => ({ ...d, autoF: v as Tri }))} options={['All', 'Yes', 'No']} />
                <FilterSelect label="Patch" value={draft.patchF} onChange={(v) => setDraft((d) => ({ ...d, patchF: v as Tri }))} options={['All', 'Yes', 'No']} />
                <FilterSelect
                  label="Numbered"
                  value={draft.numberedF}
                  onChange={(v) => setDraft((d) => ({ ...d, numberedF: v as NumberedFilter }))}
                  options={['All', 'Numbered', 'Not numbered']}
                />
              </div>
              <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-xs text-fg-muted">Purchase from</span>
                  <input
                    type="date"
                    value={draft.dateFrom}
                    onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-border bg-bg-muted px-2 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-fg-muted">Purchase to</span>
                  <input
                    type="date"
                    value={draft.dateTo}
                    onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-border bg-bg-muted px-2 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-fg-muted">Min cost ($)</span>
                  <input
                    value={draft.costMin}
                    onChange={(e) => setDraft((d) => ({ ...d, costMin: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-border bg-bg-muted px-2 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-fg-muted">Max cost ($)</span>
                  <input
                    value={draft.costMax}
                    onChange={(e) => setDraft((d) => ({ ...d, costMax: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-border bg-bg-muted px-2 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border p-4">
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...EMPTY_FILTERS });
                  setApplied({ ...EMPTY_FILTERS });
                  setFilterOpen(false);
                }}
                className="flex-1 rounded-xl border border-border bg-bg-muted/50 py-2.5 text-sm font-medium text-fg transition hover:bg-bg-muted/80"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => {
                  setApplied({ ...draft });
                  setFilterOpen(false);
                }}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-95"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* Mobile sticky selection bar (prevents “scroll to top” bulk actions) */}
      {selectedIds.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-[55] border-t border-border/70 bg-bg/85 px-3 py-3 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">{selectedIds.length} selected</div>
              <div className="text-xs text-fg-muted">Bulk actions</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected({})}
                className="rounded-2xl border border-border/70 bg-bg-muted/35 px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-muted/60"
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
                className="rounded-2xl border border-border/70 bg-bg-muted/35 px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-muted/60"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkError(null);
                  setConfirmBulkDelete(true);
                }}
                className="rounded-2xl bg-red-500/90 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkEditOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold text-fg">Bulk edit {selectedIds.length} card(s)</div>
            <div className="mt-2 text-sm text-fg-muted">Check a field to update it on every selected card. Leave the value empty to clear.</div>
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={bulkApplySport} onChange={(e) => setBulkApplySport(e.target.checked)} />
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
                <input type="checkbox" className="mt-1" checked={bulkApplyTeam} onChange={(e) => setBulkApplyTeam(e.target.checked)} />
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
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">{bulkError}</div>
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
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur sm:max-w-md">
            <div className="text-base font-semibold text-fg">Delete {selectedIds.length} card(s)?</div>
            <div className="mt-2 text-sm leading-relaxed text-fg-muted">
              This removes selected cards and their linked screenshots and transactions. This can’t be undone.
            </div>
            {bulkError ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
                {bulkError}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setConfirmBulkDelete(false)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
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
                className="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {bulkBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmSingleDelete ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur sm:max-w-md">
            <div className="text-base font-semibold text-fg">Delete this card?</div>
            <div className="mt-2 text-sm leading-relaxed text-fg-muted">This can’t be undone.</div>
            {bulkError ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
                {bulkError}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setConfirmSingleDelete(null)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
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
                className="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
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
        className="min-w-0 rounded-xl border border-border bg-bg-muted px-2 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
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
