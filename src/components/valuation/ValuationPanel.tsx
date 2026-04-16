'use client';

import { useMemo, useState } from 'react';
import type { CardValuationCurrent } from '@/types/db';
import { formatUsdFromCents } from '@/lib/money';

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function statusLabel(v: CardValuationCurrent | null) {
  if (!v) return 'Not valued yet';
  if (v.status === 'ok') return 'Valued';
  if (v.status === 'unavailable') return 'Insufficient data';
  if (v.status === 'error') return 'Error';
  return v.status;
}

export function ValuationPanel(props: {
  cardId: string;
  initial: CardValuationCurrent | null;
  costBasisCents: number | null;
}) {
  const [v, setV] = useState<CardValuationCurrent | null>(props.initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mid = v?.mid_cents ?? null;
  const gain = useMemo(() => {
    if (mid == null) return null;
    if (props.costBasisCents == null) return null;
    return mid - props.costBasisCents;
  }, [mid, props.costBasisCents]);
  const gainPct = useMemo(() => {
    if (gain == null) return null;
    if (!props.costBasisCents || props.costBasisCents <= 0) return null;
    return gain / props.costBasisCents;
  }, [gain, props.costBasisCents]);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/valuations/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardId: props.cardId }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? 'Refresh failed.');
      // Persist route writes to card_valuations_current; easiest UI update is re-fetch the row.
      const valRes = await fetch(`/api/valuations/current?cardId=${encodeURIComponent(props.cardId)}`, { cache: 'no-store' });
      const valJson = (await valRes.json()) as any;
      if (valRes.ok) setV(valJson?.valuation ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {err ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">{err}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Current value</div>
          <div className="text-sm text-fg">{mid != null ? formatUsdFromCents(mid) : '—'}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Gain/Loss</div>
          <div className="text-sm text-fg">
            {gain != null ? (
              <span className={gain >= 0 ? 'text-emerald-200' : 'text-red-200'}>{formatUsdFromCents(gain)}</span>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Confidence</div>
          <div className="text-sm text-fg">{v?.confidence != null ? pct(v.confidence) : '—'}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Last updated</div>
          <div className="text-sm text-fg">{v?.last_valued_at ? new Date(v.last_valued_at).toLocaleString() : '—'}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-fg-muted">
          Status: <span className="text-fg">{statusLabel(v)}</span>
          {v?.last_error ? <span className="text-red-200"> · {v.last_error}</span> : null}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="h-10 rounded-xl bg-bg-muted px-4 text-sm font-medium text-fg ring-1 ring-border transition hover:bg-bg-elevated/60 disabled:opacity-70"
        >
          {busy ? 'Refreshing…' : 'Refresh value'}
        </button>
      </div>
    </div>
  );
}

