'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export function UploadScreenshots({
  cardId,
  transactions,
  onUploaded,
}: {
  cardId: string;
  transactions: Array<{ id: string; label: string }>;
  onUploaded?: (assets: Array<{ id: string; path: string }>) => void;
}) {
  const router = useRouter();
  const [transactionId, setTransactionId] = useState<string>('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileCount = files?.length ?? 0;
  const canSubmit = fileCount > 0 && fileCount <= 3 && !busy;

  const txOptions = useMemo(() => [{ id: '', label: 'No transaction' }, ...transactions], [transactions]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!files || files.length === 0) {
      setError('Select 1–3 screenshots to upload.');
      return;
    }
    if (files.length > 3) {
      setError('Upload up to 3 screenshots.');
      return;
    }

    const fd = new FormData();
    fd.set('card_id', cardId);
    if (transactionId) fd.set('transaction_id', transactionId);
    for (const f of Array.from(files)) fd.append('files', f);

    setBusy(true);
    try {
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? 'Upload failed.');
      onUploaded?.((json?.assets ?? []) as Array<{ id: string; path: string }>);

      // Refresh server-rendered page data
      router.refresh();
      setFiles(null);
      setTransactionId('');
      // Clear the input value (controlled by key)
      setInputKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const [inputKey, setInputKey] = useState(0);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:items-end">
        <div className="md:col-span-2">
          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Screenshots (1–3)</div>
          <input
            key={inputKey}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="mt-2 w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg file:mr-3 file:rounded-lg file:border-0 file:bg-bg-elevated file:px-3 file:py-2 file:text-xs file:text-fg hover:file:bg-bg-elevated/80"
          />
          <div className="mt-1 text-xs text-fg-muted">
            {fileCount === 0 ? 'PNG/JPG/WEBP. Max 12MB each.' : `${fileCount} selected`}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Attach to transaction</div>
          <select
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/40"
          >
            {txOptions.map((t) => (
              <option key={t.id || 'none'} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="flex items-center justify-between">
        <div className="text-xs text-fg-muted">Uploads are stored in Supabase Storage bucket `card-assets`.</div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-accent/20 px-4 py-2 text-sm text-fg ring-1 ring-accent/30 hover:bg-accent/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}

