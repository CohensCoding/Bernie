'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { UploadScreenshots } from '@/components/assets/UploadScreenshots';

type Step = 'start' | 'upload' | 'ready';

const STEPS: Array<{ key: Step; label: string; num: number }> = [
  { key: 'start', label: 'Start', num: 1 },
  { key: 'upload', label: 'Upload', num: 2 },
  { key: 'ready', label: 'Review', num: 3 },
];

function stepIndex(s: Step) {
  if (s === 'start') return 0;
  if (s === 'upload') return 1;
  return 2;
}

export function NewCardIngest() {
  const [step, setStep] = useState<Step>('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const canContinue = uploadedCount > 0 && cardId;
  const activeIdx = stepIndex(step);

  async function createDraft() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/ingest/new', { method: 'POST' });
      const json = (await res.json()) as { error?: string; cardId?: string };
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
    if (step === 'start')
      return {
        title: 'Begin a new card',
        desc: 'We create a private draft first. Nothing appears in your portfolio until you save on the last step.',
      };
    if (step === 'upload')
      return {
        title: 'Add your screenshots',
        desc: 'Use clear captures of the listing or order confirmation—up to three images. PNG, JPG, or WebP.',
      };
    return {
      title: 'Ready when you are',
      desc: 'We will read your uploads and open a review screen. You can fix anything before it is saved.',
    };
  }, [step]);

  return (
    <div className="space-y-8">
      {/* Step rail */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ol className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const done = i < activeIdx;
            const current = i === activeIdx;
            return (
              <li key={s.key} className="flex items-center">
                {i > 0 ? <div className="mx-2 h-px w-6 bg-border sm:w-10" aria-hidden /> : null}
                <div
                  className={
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ' +
                    (current
                      ? 'border-accent/40 bg-accent/10 text-fg ring-1 ring-accent/20'
                      : done
                        ? 'border-border/60 bg-bg-muted/60 text-fg-muted'
                        : 'border-border/40 bg-transparent text-fg-muted/70')
                  }
                >
                  <span
                    className={
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ' +
                      (current ? 'bg-accent text-bg' : done ? 'bg-fg-muted/20 text-fg' : 'bg-bg-muted text-fg-muted')
                    }
                  >
                    {done ? '✓' : s.num}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-2xl border border-border/80 bg-bg-muted/30 px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">{header.title}</h2>
            <p className="text-sm leading-relaxed text-fg-muted">{header.desc}</p>
          </div>
          {step === 'start' ? (
            <button
              type="button"
              onClick={createDraft}
              disabled={busy}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-bg shadow-md transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Creating draft…' : 'Create draft & continue'}
            </button>
          ) : (
            <div className="shrink-0 rounded-xl border border-border/60 bg-bg-elevated/40 px-4 py-3 text-xs text-fg-muted">
              <div className="font-medium uppercase tracking-wider text-fg-muted/80">Draft id</div>
              <div className="mt-1 font-mono text-[13px] text-fg">{cardId ?? '—'}</div>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      {step !== 'start' && cardId ? (
        <div className="space-y-8">
          <div className="rounded-2xl border border-border/90 bg-bg-elevated/40 p-5 sm:p-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Upload</div>
            <UploadScreenshots
              cardId={cardId}
              transactions={[]}
              allowTransactionLink={false}
              onUploaded={(assets) => {
                setUploadedCount((c) => c + assets.length);
                setStep('ready');
              }}
            />
          </div>

          <div className="flex flex-col items-stretch justify-between gap-4 border-t border-border/50 pt-6 sm:flex-row sm:items-center">
            <p className="text-sm text-fg-muted">
              {uploadedCount === 0
                ? 'Upload at least one image to unlock review.'
                : `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} ready · extraction runs on the next screen.`}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {canContinue ? (
                <Link
                  href={`/ingest/review?cardId=${cardId}`}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-bg shadow-md transition hover:bg-accent-muted"
                >
                  Continue to extraction
                </Link>
              ) : (
                <span className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-xl border border-border/60 bg-bg-muted/40 px-6 text-sm font-medium text-fg-muted">
                  Continue to extraction
                </span>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-fg-muted/75">
            Nothing is published to your portfolio until you confirm on the review screen.
          </p>
        </div>
      ) : null}
    </div>
  );
}
