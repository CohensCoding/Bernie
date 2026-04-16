'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function normalizeUrlInput(s: string) {
  return s.trim();
}

export function EbayUrlImportClient() {
  const router = useRouter();
  const [rawUrl, setRawUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleaned = useMemo(() => normalizeUrlInput(rawUrl), [rawUrl]);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      if (!cleaned) throw new Error('Paste an eBay listing URL.');
      const res = await fetch('/api/import/ebay/url/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: cleaned }),
      });
      const json = (await res.json()) as { error?: string; itemId?: string; duplicateCardId?: string | null };
      if (!res.ok) throw new Error(json?.error ?? 'Unable to resolve listing URL.');
      if (!json.itemId) throw new Error('Unable to extract item id from URL.');
      const dup = json.duplicateCardId ? `&duplicateCardId=${encodeURIComponent(json.duplicateCardId)}` : '';
      router.push(`/import/ebay/url/review?itemId=${encodeURIComponent(json.itemId)}${dup}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to resolve listing URL.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1 w-full rounded-2xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="text-fg-muted">eBay listing URL</span>
        <input
          value={rawUrl}
          onChange={(e) => setRawUrl(e.target.value)}
          placeholder="https://www.ebay.com/itm/123456789012"
          className={inputClass}
          inputMode="url"
        />
      </label>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-accent-fg transition hover:opacity-95 disabled:opacity-70"
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </div>

      <div className="text-xs text-fg-muted">
        Tip: works best with full listing links (desktop or mobile). If the page blocks public access, connecting eBay will
        improve reliability.
      </div>
    </div>
  );
}

