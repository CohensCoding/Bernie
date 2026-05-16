'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { CompLookupIdentity } from '@/lib/layer2/lookup/performLookup';

type Props = {
  canonicalCardId: string;
  identity: CompLookupIdentity;
};

function localIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SaveToPortfolioButton({ canonicalCardId, identity }: Props) {
  const router = useRouter();
  const defaultDate = useMemo(() => localIsoDate(), []);

  const [open, setOpen] = useState(false);
  const [priceUsd, setPriceUsd] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(defaultDate);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function parseUsdToCents(s: string): number {
    const n = Number.parseFloat(s);
    if (!Number.isFinite(n) || n < 0) return -1;
    return Math.round(n * 100);
  }

  async function submit() {
    setErr(null);

    const cents = parseUsdToCents(priceUsd);
    if (cents < 0) {
      setErr('Enter a valid USD amount.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/comp/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canonicalCardId,
          identity: {
            player: identity.player,
            year: identity.year,
            setName: identity.setName,
            cardNumber: identity.cardNumber,
            parallel: identity.parallel,
            grader: identity.grader,
            grade: identity.grade,
          },
          purchase: {
            pricePaidCents: cents,
            purchaseDate,
            ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
          },
        }),
      });

      const j = (await res.json()) as { error?: string; redirectUrl?: string; cardId?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Save failed.');
        return;
      }
      setOpen(false);
      if (j.redirectUrl) {
        router.push(j.redirectUrl);
        return;
      }
      if (j.cardId) {
        router.push(`/cards/${j.cardId}`);
      }
    } catch {
      setErr('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-10 w-full rounded-xl border border-accent/40 bg-accent/15 px-4 py-4 text-lg font-semibold text-fg shadow-sm ring-1 ring-accent/25 transition hover:bg-accent/25"
      >
        Save to portfolio
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Log purchase"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-5 shadow-2xl">
            <div className="text-lg font-semibold text-fg">Log purchase</div>
            <p className="mt-1 text-sm text-fg-muted">Total paid (tax + shipping included), stored as integer cents.</p>

            <label className="mt-4 block text-sm text-fg">
              Amount (USD) *
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-muted/30 px-3 py-3 text-base text-fg"
              />
            </label>

            <label className="mt-3 block text-sm text-fg">
              Purchase date
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-muted/30 px-3 py-3 text-base text-fg"
              />
            </label>

            <label className="mt-3 block text-sm text-fg">
              Notes <span className="text-fg-muted">(optional)</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-muted/30 px-3 py-2 text-sm text-fg"
              />
            </label>

            {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-fg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
