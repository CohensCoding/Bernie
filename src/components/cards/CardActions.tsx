'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CardActions({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/cards/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card_ids: [cardId] }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? 'Delete failed.');
      router.push('/portfolio');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/[0.1]"
      >
        Delete
      </button>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold tracking-tight text-fg">Delete this card?</div>
            <div className="mt-2 text-sm leading-relaxed text-fg-muted">
              This removes the card from your portfolio and deletes linked screenshots and transactions. This can’t be
              undone.
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2 text-sm font-medium text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="rounded-xl bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {busy ? 'Deleting…' : 'Delete card'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

