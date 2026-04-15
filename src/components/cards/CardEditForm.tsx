'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Card, CardTransaction } from '@/types/db';

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseUsdToCents(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

export function CardEditForm({ card, latestTransaction }: { card: Card; latestTransaction: CardTransaction | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [player_name, setPlayerName] = useState(card.player_name ?? '');
  const [sport, setSport] = useState(card.sport ?? '');
  const [team, setTeam] = useState(card.team ?? '');
  const [year, setYear] = useState(card.year != null ? String(card.year) : '');
  const [brand, setBrand] = useState(card.brand ?? '');
  const [set_name, setSetName] = useState(card.set_name ?? '');
  const [subset, setSubset] = useState(card.subset ?? '');
  const [card_number, setCardNumber] = useState(card.card_number ?? '');
  const [parallel, setParallel] = useState(card.parallel ?? '');
  const [serial_number, setSerialNumber] = useState(card.serial_number != null ? String(card.serial_number) : '');
  const [print_run, setPrintRun] = useState(card.print_run != null ? String(card.print_run) : '');
  const [rookie, setRookie] = useState(card.rookie);
  const [auto, setAuto] = useState(card.auto);
  const [patch, setPatch] = useState(card.patch);
  const [graded, setGraded] = useState(card.graded);
  const [grading_company, setGradingCompany] = useState(card.grading_company ?? '');
  const [grade, setGrade] = useState(card.grade ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [title_raw, setTitleRaw] = useState(card.title_raw ?? '');

  const [txPlatform, setTxPlatform] = useState(latestTransaction?.platform ?? '');
  const [txSourceUrl, setTxSourceUrl] = useState(latestTransaction?.source_url ?? '');
  const [txTitleRaw, setTxTitleRaw] = useState(latestTransaction?.title_raw ?? '');
  const [txPurchaseDate, setTxPurchaseDate] = useState(latestTransaction?.purchase_date ?? '');
  const [txPurchase, setTxPurchase] = useState(
    latestTransaction ? centsToInput(latestTransaction.purchase_price_cents) : '0.00',
  );
  const [txTaxes, setTxTaxes] = useState(latestTransaction ? centsToInput(latestTransaction.taxes_cents) : '0.00');
  const [txShipping, setTxShipping] = useState(
    latestTransaction ? centsToInput(latestTransaction.shipping_cents) : '0.00',
  );
  const [txTotal, setTxTotal] = useState(latestTransaction ? centsToInput(latestTransaction.total_cost_cents) : '0.00');
  const [txNotes, setTxNotes] = useState(latestTransaction?.notes ?? '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const yearNum = year.trim() === '' ? null : Number(year);
      const sn = serial_number.trim() === '' ? null : Number(serial_number);
      const pr = print_run.trim() === '' ? null : Number(print_run);
      const cardPayload = {
        title_raw: title_raw.trim() || null,
        player_name: player_name.trim() || null,
        sport: sport.trim() || null,
        team: team.trim() || null,
        year: yearNum != null && Number.isFinite(yearNum) ? Math.trunc(yearNum) : null,
        brand: brand.trim() || null,
        set_name: set_name.trim() || null,
        subset: subset.trim() || null,
        card_number: card_number.trim() || null,
        parallel: parallel.trim() || null,
        serial_number: sn != null && Number.isFinite(sn) ? Math.trunc(sn) : null,
        print_run: pr != null && Number.isFinite(pr) ? Math.trunc(pr) : null,
        rookie,
        auto,
        patch,
        graded,
        grading_company: grading_company.trim() || null,
        grade: grade.trim() || null,
        notes: notes.trim() || null,
      };

      const body: {
        card: typeof cardPayload;
        transaction?: Record<string, unknown>;
      } = { card: cardPayload };

      if (latestTransaction) {
        body.transaction = {
          id: latestTransaction.id,
          platform: txPlatform.trim() || null,
          source_url: txSourceUrl.trim() || null,
          title_raw: txTitleRaw.trim() || null,
          purchase_date: txPurchaseDate.trim() || null,
          purchase_price_cents: parseUsdToCents(txPurchase),
          taxes_cents: parseUsdToCents(txTaxes),
          shipping_cents: parseUsdToCents(txShipping),
          total_cost_cents: parseUsdToCents(txTotal),
          notes: txNotes.trim() || null,
        };
      }

      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Save failed.');
      router.push(`/cards/${card.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1 w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40';

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-border bg-bg-elevated/40 p-5">
        <h2 className="text-sm font-semibold text-fg">Card fields</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-fg-muted">Player</span>
            <input value={player_name} onChange={(e) => setPlayerName(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Year</span>
            <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} inputMode="numeric" />
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
            <span className="text-fg-muted">Brand</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Set name</span>
            <input value={set_name} onChange={(e) => setSetName(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Subset</span>
            <input value={subset} onChange={(e) => setSubset(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Card #</span>
            <input value={card_number} onChange={(e) => setCardNumber(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Parallel</span>
            <input value={parallel} onChange={(e) => setParallel(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Serial #</span>
            <input value={serial_number} onChange={(e) => setSerialNumber(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="text-fg-muted">Print run</span>
            <input value={print_run} onChange={(e) => setPrintRun(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-fg-muted">Title (raw)</span>
            <input value={title_raw} onChange={(e) => setTitleRaw(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-fg-muted">Collection notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={inputClass} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={graded} onChange={(e) => setGraded(e.target.checked)} />
            Graded
          </label>
        </div>

        {graded ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-fg-muted">Grading company</span>
              <input
                value={grading_company}
                onChange={(e) => setGradingCompany(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Grade</span>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass} />
            </label>
          </div>
        ) : null}
      </section>

      {latestTransaction ? (
        <section className="rounded-2xl border border-border bg-bg-elevated/40 p-5">
          <h2 className="text-sm font-semibold text-fg">Latest purchase (transaction)</h2>
          <p className="mt-1 text-xs text-fg-muted">Updates the most recent transaction linked to this card.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-fg-muted">Platform</span>
              <input value={txPlatform} onChange={(e) => setTxPlatform(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Purchase date</span>
              <input type="date" value={txPurchaseDate ?? ''} onChange={(e) => setTxPurchaseDate(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Purchase ($)</span>
              <input value={txPurchase} onChange={(e) => setTxPurchase(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Taxes ($)</span>
              <input value={txTaxes} onChange={(e) => setTxTaxes(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Shipping ($)</span>
              <input value={txShipping} onChange={(e) => setTxShipping(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-fg-muted">Total cost ($)</span>
              <input value={txTotal} onChange={(e) => setTxTotal(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-fg-muted">Source URL</span>
              <input value={txSourceUrl} onChange={(e) => setTxSourceUrl(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-fg-muted">Listing title (raw)</span>
              <input value={txTitleRaw} onChange={(e) => setTxTitleRaw(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-fg-muted">Transaction notes</span>
              <textarea value={txNotes} onChange={(e) => setTxNotes(e.target.value)} rows={3} className={inputClass} />
            </label>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-muted/40 p-4 text-sm text-fg-muted">
          No transactions on this card yet — purchase fields are unavailable until you add one via ingest.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-95 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => router.push(`/cards/${card.id}`)}
          className="rounded-xl border border-border bg-bg-muted px-4 py-2 text-sm text-fg transition hover:bg-bg-muted/80 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
