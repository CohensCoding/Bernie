'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export function UploadScreenshots({
  cardId,
  transactions,
  onUploaded,
  allowTransactionLink = true,
}: {
  cardId: string;
  transactions: Array<{ id: string; label: string }>;
  onUploaded?: (assets: Array<{ id: string; path: string }>) => void;
  allowTransactionLink?: boolean;
}) {
  const router = useRouter();
  const [transactionId, setTransactionId] = useState<string>('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileCount = files?.length ?? 0;
  const canSubmit = fileCount > 0 && fileCount <= 3 && !busy;

  const showTransactionSelect = allowTransactionLink && transactions.length > 0;
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
    if (showTransactionSelect && transactionId) fd.set('transaction_id', transactionId);
    for (const f of Array.from(files)) fd.append('files', f);

    setBusy(true);
    try {
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as { error?: string; assets?: Array<{ id: string; path: string }> };
      if (!res.ok) throw new Error(json?.error ?? 'Upload failed.');
      onUploaded?.((json?.assets ?? []) as Array<{ id: string; path: string }>);

      router.refresh();
      setFiles(null);
      setTransactionId('');
      setInputKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const [inputKey, setInputKey] = useState(0);

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <label className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Images (1–3)</label>
          <input
            key={inputKey}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="mt-2 w-full cursor-pointer rounded-xl border border-dashed border-border/90 bg-bg-muted/40 px-3 py-3 text-sm text-fg file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-fg file:ring-1 file:ring-accent/25 hover:border-accent/30 hover:bg-bg-muted/60"
          />
          <div className="mt-2 text-xs text-fg-muted">
            {fileCount === 0 ? 'PNG, JPG, or WebP · up to 12MB each' : `${fileCount} file${fileCount === 1 ? '' : 's'} selected`}
          </div>
        </div>

        {showTransactionSelect ? (
          <div className="lg:col-span-4">
            <label className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              Link to purchase (optional)
            </label>
            <select
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border/90 bg-bg-muted/80 px-3.5 py-2.5 text-sm text-fg shadow-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/25"
            >
              {txOptions.map((t) => (
                <option key={t.id || 'none'} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">{error}</div> : null}

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-border/40 pt-5 sm:flex-row sm:items-center">
        <p className="text-[11px] leading-relaxed text-fg-muted/70">Files are stored securely for this card.</p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-xl border border-border/80 bg-bg-elevated/60 px-5 text-sm font-semibold text-fg transition hover:border-accent/30 hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}
