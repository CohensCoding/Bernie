'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { EbayPurchase } from '@/lib/ebay/purchases/types';
import { formatUsdFromCents } from '@/lib/money';
import { lightParseTitle } from '@/components/import/ebay/lightParse';

function parseUsdToCents(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

export function EbayImportReviewClient() {
  const router = useRouter();
  const params = useSearchParams();
  const purchaseId = params.get('purchaseId') ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<EbayPurchase | null>(null);
  const [busy, setBusy] = useState(false);

  // editable fields (minimal MVP)
  const [player, setPlayer] = useState('');
  const [year, setYear] = useState('');
  const [brand, setBrand] = useState('');
  const [setName, setSetName] = useState('');
  const [sport, setSport] = useState('');
  const [team, setTeam] = useState('');
  const [parallel, setParallel] = useState('');
  const [graded, setGraded] = useState(false);
  const [grader, setGrader] = useState('');
  const [grade, setGrade] = useState('');
  const [auto, setAuto] = useState(false);
  const [patch, setPatch] = useState(false);
  const [notes, setNotes] = useState('');

  const [purchasePrice, setPurchasePrice] = useState('0.00');
  const [totalCost, setTotalCost] = useState('0.00');
  const [purchaseDate, setPurchaseDate] = useState('');

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      try {
        if (!purchaseId) throw new Error('Missing purchase id.');
        const res = await fetch(`/api/import/ebay/purchase?id=${encodeURIComponent(purchaseId)}`, { cache: 'no-store' });
        const json = (await res.json()) as { ok?: boolean; error?: string; purchase?: EbayPurchase };
        if (!res.ok) throw new Error(json?.error ?? 'Unable to load purchase.');
        const p = json.purchase!;
        setPurchase(p);

        const parsed = lightParseTitle(p.title);
        setYear(parsed.year ? String(parsed.year) : '');
        setPlayer(parsed.player_hint ?? '');
        setBrand(parsed.brand ?? '');
        setSetName(parsed.set_hint ?? '');
        setTeam(parsed.team_hint ?? '');
        setGraded(parsed.graded);
        setGrader(parsed.grading_company ?? '');
        setGrade(parsed.grade ?? '');
        setAuto(parsed.auto);
        setPatch(parsed.patch);

        setTotalCost((p.totalCostCents / 100).toFixed(2));
        setPurchasePrice((p.totalCostCents / 100).toFixed(2));
        setPurchaseDate(p.purchasedAt ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load purchase.');
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [purchaseId]);

  const rawSummary = useMemo(() => {
    if (!purchase) return null;
    return {
      title: purchase.title,
      date: purchase.purchasedAt,
      total: formatUsdFromCents(purchase.totalCostCents),
      url: purchase.external.listingUrl ?? null,
    };
  }, [purchase]);

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
          {error}
        </div>
        <Link href="/import/ebay" className="text-sm text-accent hover:underline underline-offset-4">
          Back to import
        </Link>
      </div>
    );
  }

  if (!purchase || !rawSummary) return null;

  const inputClass =
    'mt-1 w-full rounded-2xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/70 bg-bg-muted/25 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Raw (from eBay)</div>
        <div className="mt-2 text-sm font-medium text-fg">{rawSummary.title}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          <span className="rounded-full border border-border/60 bg-bg-muted/30 px-2 py-0.5">eBay</span>
          {rawSummary.date ? <span>{rawSummary.date}</span> : null}
          <span className="text-fg-muted/40">·</span>
          <span className="font-medium text-fg">{rawSummary.total}</span>
          {rawSummary.url ? (
            <>
              <span className="text-fg-muted/40">·</span>
              <a href={rawSummary.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                View listing
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-fg-muted">Player</span>
          <input value={player} onChange={(e) => setPlayer(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Year</span>
          <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} inputMode="numeric" />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Brand</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Set</span>
          <input value={setName} onChange={(e) => setSetName(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Sport</span>
          <input value={sport} onChange={(e) => setSport(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Team</span>
          <input value={team} onChange={(e) => setTeam(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-fg-muted">Parallel</span>
          <input value={parallel} onChange={(e) => setParallel(e.target.value)} className={inputClass} />
        </label>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border/70 bg-bg-muted/20 p-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} />
          Graded
        </label>
        <div className="flex items-center gap-4 text-sm text-fg">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={patch} onChange={(e) => setPatch(e.target.checked)} />
            Patch
          </label>
        </div>
        {graded ? (
          <>
            <label className="text-sm">
              <span className="text-fg-muted">Grading company</span>
              <input value={grader} onChange={(e) => setGrader(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Grade</span>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass} />
            </label>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-fg-muted">Purchase date</span>
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Purchase price ($)</span>
          <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Total cost ($)</span>
          <input value={totalCost} onChange={(e) => setTotalCost(e.target.value)} className={inputClass} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-fg-muted">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={inputClass} />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/import/ebay" className="text-sm text-fg-muted hover:text-fg">
          Back
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const yearNum = year.trim() ? Number(year) : null;
              const res = await fetch('/api/import/ebay/commit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  purchase,
                  card: {
                    title_raw: purchase.title,
                    player_name: player.trim() || null,
                    sport: sport.trim() || null,
                    team: team.trim() || null,
                    year: yearNum != null && Number.isFinite(yearNum) ? Math.trunc(yearNum) : null,
                    brand: brand.trim() || null,
                    set_name: setName.trim() || null,
                    parallel: parallel.trim() || null,
                    auto,
                    patch,
                    graded,
                    grading_company: grader.trim() || null,
                    grade: grade.trim() || null,
                    notes: notes.trim() || null,
                  },
                  transaction: {
                    purchase_date: purchaseDate.trim() || null,
                    purchase_price_cents: parseUsdToCents(purchasePrice),
                    taxes_cents: 0,
                    shipping_cents: 0,
                    total_cost_cents: parseUsdToCents(totalCost),
                    notes: null,
                  },
                }),
              });
              const json = (await res.json()) as { error?: string; card_id?: string };
              if (res.status === 409 && json.card_id) {
                router.push(`/cards/${json.card_id}`);
                return;
              }
              if (!res.ok) throw new Error(json?.error ?? 'Import failed.');
              router.push(`/cards/${json.card_id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Import failed.');
            } finally {
              setBusy(false);
            }
          }}
          className="h-12 rounded-2xl bg-accent px-5 text-sm font-semibold text-accent-fg transition hover:opacity-95 disabled:opacity-70"
        >
          {busy ? 'Saving…' : 'Save to collection'}
        </button>
      </div>
    </div>
  );
}

