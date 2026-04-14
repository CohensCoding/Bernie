'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { UploadScreenshots } from '@/components/assets/UploadScreenshots';

type Step = 'start' | 'upload' | 'ready';

export function NewCardIngest() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const canContinue = uploadedCount > 0 && cardId;

  async function createDraft() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/ingest/new', { method: 'POST' });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? 'Unable to create draft card.');
      setCardId(json.cardId as string);
      setStep('upload');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create draft card.');
    } finally {
      setBusy(false);
    }
  }

  const header = useMemo(() => {
    if (step === 'start') return { title: 'Create draft', desc: 'Start a new card ingestion session.' };
    if (step === 'upload') return { title: 'Upload screenshots', desc: 'Add 1–3 screenshots to power extraction.' };
    return { title: 'Review & save', desc: 'Run extraction and confirm details before saving.' };
  }, [step]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-medium text-fg">{header.title}</div>
          <div className="mt-1 text-xs text-fg-muted">{header.desc}</div>
        </div>
        {step === 'start' ? (
          <button
            onClick={createDraft}
            disabled={busy}
            className="rounded-xl bg-accent/20 px-4 py-2 text-sm text-fg ring-1 ring-accent/30 hover:bg-accent/25 disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Start'}
          </button>
        ) : (
          <div className="text-xs text-fg-muted">
            Draft card: <span className="font-mono text-fg">{cardId ?? '—'}</span>
          </div>
        )}
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

      {step !== 'start' && cardId ? (
        <div className="space-y-4">
          <UploadScreenshots
            cardId={cardId}
            transactions={[]}
            onUploaded={(assets) => {
              setUploadedCount((c) => c + assets.length);
              setStep('ready');
            }}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-fg-muted">
              {uploadedCount === 0 ? 'Upload at least 1 screenshot to continue.' : `${uploadedCount} screenshot(s) uploaded.`}
            </div>
            {canContinue ? (
              <Link
                href={`/ingest/review?cardId=${cardId}`}
                className="inline-flex items-center justify-center rounded-xl bg-accent/20 px-4 py-2 text-sm text-fg ring-1 ring-accent/30 hover:bg-accent/25"
              >
                Run extraction & review
              </Link>
            ) : (
              <button
                disabled
                className="inline-flex items-center justify-center rounded-xl bg-accent/10 px-4 py-2 text-sm text-fg-muted ring-1 ring-accent/20 opacity-60"
              >
                Run extraction & review
              </button>
            )}
          </div>

          <div className="text-xs text-fg-muted">
            You’ll be able to correct any fields before saving. Nothing auto-saves from screenshots.
          </div>
        </div>
      ) : null}
    </div>
  );
}

