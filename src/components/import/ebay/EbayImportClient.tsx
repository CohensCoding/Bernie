'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { EbayPurchase } from '@/lib/ebay/purchases/types';
import { formatUsdFromCents } from '@/lib/money';

const HIDDEN_KEY = 'bernie.ebayImport.hidden.v1';

const HINTS = ['Topps', 'Bowman', 'Panini', 'PSA', 'BGS', 'SGC', 'Auto', 'Autograph', 'Patch'];

function loadHidden(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveHidden(v: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(v));
}

export function EbayImportClient() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hint, setHint] = useState<string>('All');
  const [items, setItems] = useState<EbayPurchase[]>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHidden(loadHidden());
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import/ebay/purchases?days=90', { cache: 'no-store' });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        hint?: string;
        purchases?: EbayPurchase[];
      };
      if (res.status === 401) {
        setConnected(false);
        setItems([]);
        return;
      }
      if (res.status === 503 && json?.code === 'EBAY_DB_NOT_MIGRATED') {
        setConnected(false);
        setItems([]);
        setError(`${json.error}${json.hint ? `\n\n${json.hint}` : ''}`);
        return;
      }
      if (!res.ok) throw new Error(json?.error ?? 'Unable to load purchases.');
      setConnected(true);
      setItems(json.purchases ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load purchases.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (hidden[p.id]) return false;
      if (hint !== 'All') {
        const h = hint.toLowerCase();
        if (!p.title.toLowerCase().includes(h)) return false;
      }
      if (!q) return true;
      return p.title.toLowerCase().includes(q);
    });
  }, [items, query, hint, hidden]);

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;

  if (connected === false) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/80 bg-bg-muted/30 p-5">
          <div className="text-sm font-semibold text-fg">Connect eBay</div>
          <div className="mt-2 text-sm text-fg-muted">
            This is a selective import. You’ll browse recent purchases and choose what to add.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/api/integrations/ebay/connect"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-accent-fg transition hover:opacity-95"
            >
              Connect eBay
            </a>
          </div>
        </div>
        <div className="text-xs text-fg-muted">
          You can disconnect anytime. Bernie never auto-imports anything.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search purchases…"
          className="h-11 w-full rounded-2xl border border-border/80 bg-bg-muted/50 px-4 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex items-center gap-2">
          <select
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            className="h-11 rounded-2xl border border-border/80 bg-bg-muted/50 px-4 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="All">All</option>
            {HINTS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                const res = await fetch('/api/integrations/ebay/disconnect', { method: 'POST' });
                if (!res.ok) throw new Error('Unable to disconnect.');
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Unable to disconnect.');
              }
            }}
            className="h-11 rounded-2xl border border-border/80 bg-bg-muted/40 px-4 text-sm font-medium text-fg transition hover:bg-bg-muted/70"
          >
            Disconnect
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200 whitespace-pre-line">
          {error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-bg-muted/30 p-6 text-sm text-fg-muted">
          No purchases to show. Try changing your search or filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex gap-3 rounded-2xl border border-border/70 bg-bg-elevated/30 p-4"
            >
              <div className="shrink-0">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-14 w-14 rounded-xl border border-border/60 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border/50 text-[10px] text-fg-muted">
                    —
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{p.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                  <span className="rounded-full border border-border/60 bg-bg-muted/30 px-2 py-0.5">eBay</span>
                  {p.purchasedAt ? <span>{p.purchasedAt}</span> : null}
                  <span className="text-fg-muted/40">·</span>
                  <span className="font-medium text-fg">{formatUsdFromCents(p.totalCostCents)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/import/ebay/review?purchaseId=${encodeURIComponent(p.id)}`}
                    className="inline-flex h-10 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:opacity-95"
                  >
                    Import
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...hidden, [p.id]: true };
                      setHidden(next);
                      saveHidden(next);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-bg-muted/30 px-4 text-sm font-medium text-fg transition hover:bg-bg-muted/60"
                  >
                    Not now
                  </button>
                  {p.external.listingUrl ? (
                    <a
                      href={p.external.listingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-bg-muted/30 px-4 text-sm font-medium text-fg transition hover:bg-bg-muted/60"
                    >
                      View
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-fg-muted">
        Hidden items are temporary for this device. You’re always in control.
      </div>
    </div>
  );
}

