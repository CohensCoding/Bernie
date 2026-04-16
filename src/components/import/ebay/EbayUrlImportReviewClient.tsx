'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { mergeTitleAndItemSpecifics, sanitizePlayerName } from '@/components/import/ebay/lightParse';
import { formatUsdFromCents } from '@/lib/money';

function parseUsdToCents(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

type EbayUrlListing = {
  source: 'ebay';
  itemId: string;
  listingUrl: string;
  title: string | null;
  imageUrl: string | null;
  itemSpecifics?: Record<string, string>;
  purchase?: {
    purchase_date: string | null;
    purchase_price_cents: number | null;
    taxes_cents: number | null;
    shipping_cents: number | null;
    total_cost_cents: number | null;
    currency: string | null;
  };
};

export function EbayUrlImportReviewClient() {
  const router = useRouter();
  const params = useSearchParams();
  const itemId = params.get('itemId') ?? '';
  const duplicateCardId = params.get('duplicateCardId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState<EbayUrlListing | null>(null);
  const [duplicate, setDuplicate] = useState<any | null>(null);

  // editable fields
  const [player, setPlayer] = useState('');
  const [year, setYear] = useState('');
  const [brand, setBrand] = useState('');
  const [setName, setSetName] = useState('');
  const [sport, setSport] = useState('');
  const [team, setTeam] = useState('');
  const [parallel, setParallel] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [printRun, setPrintRun] = useState('');
  const [rookie, setRookie] = useState(false);
  const [graded, setGraded] = useState(false);
  const [grader, setGrader] = useState('');
  const [grade, setGrade] = useState('');
  const [auto, setAuto] = useState(false);
  const [patch, setPatch] = useState(false);
  const [notes, setNotes] = useState('');

  const [purchasePrice, setPurchasePrice] = useState('0.00');
  const [shippingCost, setShippingCost] = useState('0.00');
  const [taxesCost, setTaxesCost] = useState('0.00');
  const [totalCost, setTotalCost] = useState('0.00');
  const [purchaseDate, setPurchaseDate] = useState('');

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      try {
        if (!itemId) throw new Error('Missing item id.');
        const res = await fetch(`/api/import/ebay/url/item?itemId=${encodeURIComponent(itemId)}`, { cache: 'no-store' });
        const json = (await res.json()) as { error?: string; listing?: EbayUrlListing };
        if (!res.ok) throw new Error(json?.error ?? 'Unable to load listing.');
        const l = json.listing!;
        setListing(l);

        const parsed = mergeTitleAndItemSpecifics(l.title ?? '', l.itemSpecifics ?? null);
        setYear(parsed.year ? String(parsed.year) : '');
        setPlayer(sanitizePlayerName(parsed.player_hint) ?? '');
        setBrand(parsed.brand ?? '');
        setSetName(parsed.set_hint ?? '');
        setSport(parsed.sport_hint ?? '');
        setTeam(parsed.team_hint ?? '');
        setParallel(parsed.parallel_hint ?? '');
        setCardNumber(parsed.card_number_hint ?? '');
        setSerialNumber(parsed.serial_number_hint != null ? String(parsed.serial_number_hint) : '');
        setPrintRun(parsed.print_run_hint != null ? String(parsed.print_run_hint) : '');
        setRookie(parsed.rookie);
        setGraded(parsed.graded);
        setGrader(parsed.grading_company ?? '');
        setGrade(parsed.grade ?? '');
        setAuto(parsed.auto);
        setPatch(parsed.patch);

        const p = l.purchase;
        if (p?.purchase_price_cents != null) setPurchasePrice((p.purchase_price_cents / 100).toFixed(2));
        if (p?.shipping_cents != null) setShippingCost((p.shipping_cents / 100).toFixed(2));
        if (p?.taxes_cents != null) setTaxesCost((p.taxes_cents / 100).toFixed(2));
        if (p?.total_cost_cents != null) setTotalCost((p.total_cost_cents / 100).toFixed(2));
        if (p?.purchase_date) setPurchaseDate(p.purchase_date.slice(0, 10));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load listing.');
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [itemId]);

  useEffect(() => {
    async function run() {
      if (!duplicateCardId) return;
      try {
        const res = await fetch(`/api/cards/summary?id=${encodeURIComponent(duplicateCardId)}`, { cache: 'no-store' });
        const json = (await res.json()) as any;
        if (!res.ok) return;
        setDuplicate(json);
      } catch {
        // ignore; warning is best-effort
      }
    }
    run();
  }, [duplicateCardId]);

  const rawSummary = useMemo(() => {
    if (!listing) return null;
    return {
      title: listing.title ?? `eBay item ${listing.itemId}`,
      url: listing.listingUrl,
      total: formatUsdFromCents(parseUsdToCents(totalCost)),
    };
  }, [listing, totalCost]);

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
          {error}
        </div>
        <Link href="/import/ebay/url" className="text-sm text-accent hover:underline underline-offset-4">
          Back
        </Link>
      </div>
    );
  }

  if (!listing || !rawSummary) return null;

  const inputClass =
    'mt-1 w-full rounded-2xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/70 bg-bg-muted/25 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Raw (from eBay)</div>
        <div className="mt-2 text-sm font-medium text-fg">{rawSummary.title}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          <span className="rounded-full border border-border/60 bg-bg-muted/30 px-2 py-0.5">eBay</span>
          <span className="text-fg-muted/40">·</span>
          <a href={rawSummary.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            View listing
          </a>
        </div>
      </div>

      {duplicateCardId ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">Possible duplicate</div>
          <div className="mt-2 text-sm text-amber-100/90">
            This eBay item looks like it may already be in your collection. Review before saving.
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-500/20 bg-bg-muted/20 p-3">
              <div className="text-xs font-semibold text-amber-100/90">Incoming</div>
              <div className="mt-1 text-sm text-fg">{rawSummary.title}</div>
              <div className="mt-2 text-xs text-fg-muted">
                Total: <span className="text-fg">{rawSummary.total}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-amber-100/90">Existing</div>
                <Link href={`/cards/${duplicateCardId}`} className="text-xs text-amber-200 hover:underline">
                  Open card
                </Link>
              </div>
              {duplicate?.card ? (
                <>
                  <div className="mt-1 text-sm text-fg">
                    {[duplicate.card.year, duplicate.card.brand, duplicate.card.set_name, duplicate.card.player_name]
                      .filter(Boolean)
                      .join(' ')}
                  </div>
                  {duplicate?.latestTransaction?.source_url ? (
                    <div className="mt-2 text-xs text-fg-muted">
                      Source:{' '}
                      <a
                        href={duplicate.latestTransaction.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-200 hover:underline"
                      >
                        eBay link
                      </a>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-1 text-xs text-fg-muted">Loading existing card…</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
        <label className="text-sm">
          <span className="text-fg-muted">Card #</span>
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Parallel</span>
          <input value={parallel} onChange={(e) => setParallel(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Serial #</span>
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={inputClass} inputMode="numeric" />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Print run</span>
          <input value={printRun} onChange={(e) => setPrintRun(e.target.value)} className={inputClass} inputMode="numeric" />
        </label>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border/70 bg-bg-muted/20 p-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} />
          Graded
        </label>
        <div className="flex flex-wrap items-center gap-4 text-sm text-fg">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rookie} onChange={(e) => setRookie(e.target.checked)} />
            Rookie
          </label>
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
          <input
            value={purchasePrice}
            onChange={(e) => {
              const v = e.target.value;
              setPurchasePrice(v);
              const total = parseUsdToCents(v) + parseUsdToCents(shippingCost) + parseUsdToCents(taxesCost);
              setTotalCost((total / 100).toFixed(2));
            }}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Shipping ($)</span>
          <input
            value={shippingCost}
            onChange={(e) => {
              const v = e.target.value;
              setShippingCost(v);
              const total = parseUsdToCents(purchasePrice) + parseUsdToCents(v) + parseUsdToCents(taxesCost);
              setTotalCost((total / 100).toFixed(2));
            }}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="text-fg-muted">Taxes ($)</span>
          <input
            value={taxesCost}
            onChange={(e) => {
              const v = e.target.value;
              setTaxesCost(v);
              const total = parseUsdToCents(purchasePrice) + parseUsdToCents(shippingCost) + parseUsdToCents(v);
              setTotalCost((total / 100).toFixed(2));
            }}
            className={inputClass}
          />
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
        <Link href="/import/ebay/url" className="text-sm text-fg-muted hover:text-fg">
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
              const res = await fetch('/api/import/ebay/url/commit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  listing,
                  card: {
                    title_raw: listing.title ?? null,
                    player_name: sanitizePlayerName(player.trim()) || null,
                    sport: sport.trim() || null,
                    team: team.trim() || null,
                    year: yearNum != null && Number.isFinite(yearNum) ? Math.trunc(yearNum) : null,
                    brand: brand.trim() || null,
                    set_name: setName.trim() || null,
                    card_number: cardNumber.trim() || null,
                    parallel: parallel.trim() || null,
                    serial_number:
                      serialNumber.trim() !== '' && Number.isFinite(Number(serialNumber)) ? Math.trunc(Number(serialNumber)) : null,
                    print_run:
                      printRun.trim() !== '' && Number.isFinite(Number(printRun)) ? Math.trunc(Number(printRun)) : null,
                    rookie,
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
                    taxes_cents: parseUsdToCents(taxesCost),
                    shipping_cents: parseUsdToCents(shippingCost),
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

