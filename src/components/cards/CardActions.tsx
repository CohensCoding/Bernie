'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function CardActions({ cardId, initialNotes }: { cardId: string; initialNotes: string | null }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(initialNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteOpen) setNoteDraft(initialNotes ?? '');
  }, [initialNotes, noteOpen]);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/cards/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card_ids: [cardId] }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Delete failed.');
      router.push('/cards');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
      setBusy(false);
    }
  }

  async function onSaveNotes() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card: { notes: noteDraft.trim() || null } }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Could not save notes.');
      setNoteOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save notes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={`/cards/${cardId}/edit`}
        className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-elevated/60"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={() => {
          setNoteDraft(initialNotes ?? '');
          setError(null);
          setNoteOpen(true);
        }}
        className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-elevated/60"
      >
        Notes
      </button>
      <a
        href="#card-assets"
        className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-elevated/60"
      >
        Upload images
      </a>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/[0.1]"
      >
        Delete
      </button>

      {noteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-bg-elevated/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold tracking-tight text-fg">Collection notes</div>
            <div className="mt-2 text-sm text-fg-muted">Saved on the card record.</div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={6}
              className="mt-4 w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
            />
            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setNoteOpen(false)}
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-4 py-2 text-sm font-medium text-fg transition hover:bg-bg-muted/70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onSaveNotes}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-95 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
