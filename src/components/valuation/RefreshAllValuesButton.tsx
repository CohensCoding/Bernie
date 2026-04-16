'use client';

import { useState } from 'react';

export function RefreshAllValuesButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/valuations/refresh-all', { method: 'POST' });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? 'Refresh failed.');
      setMsg('Refresh started.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-xs font-medium text-fg transition hover:bg-bg-muted/70 disabled:opacity-70"
      >
        {busy ? 'Refreshing…' : 'Refresh All Values'}
      </button>
      {msg ? <div className="hidden text-xs text-fg-muted sm:block">{msg}</div> : null}
    </div>
  );
}

