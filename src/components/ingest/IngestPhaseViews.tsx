'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const ROTATING_LINES = [
  'Scanning your listing…',
  'Extracting card details…',
  'Reviewing screenshots…',
  'Building your draft card…',
];

export function ExtractionProgressView({
  assets,
}: {
  assets: Array<{ id: string; signed_url: string | null; label: string }>;
}) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % ROTATING_LINES.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  const line = ROTATING_LINES[lineIndex] ?? ROTATING_LINES[0];
  const thumbs = useMemo(() => assets.slice(0, 3), [assets]);

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 shadow-[0_0_40px_-12px_hsl(156_72%_45%/0.35)]">
          <span className="relative flex h-9 w-9">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/20 opacity-75" />
            <span className="relative m-auto h-5 w-5 rounded-full border-2 border-accent/50 border-t-accent animate-spin" style={{ animationDuration: '1.1s' }} />
          </span>
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Working on your card</h2>
        <p className="mt-3 min-h-[3rem] text-sm leading-relaxed text-fg-muted transition-opacity duration-300">{line}</p>

        <div className="mx-auto mt-8 h-1 max-w-xs overflow-hidden rounded-full bg-border">
          <div className="ingest-progress-indeterminate h-full rounded-full bg-accent/70" />
        </div>

        {thumbs.length > 0 ? (
          <div className="mt-10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-muted/90">Your screenshots</div>
            <div className="mt-3 flex justify-center gap-3">
              {thumbs.map((a) => (
                <div
                  key={a.id}
                  className="relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-bg-muted shadow-sm ring-1 ring-white/[0.04]"
                >
                  {a.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.signed_url} alt="" className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-fg-muted">No preview</div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/40 to-transparent" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-10 text-xs text-fg-muted/80">Usually takes a few seconds. You can leave this tab open.</p>
      </div>
    </div>
  );
}

function failureBannerTone(kind: string | null): 'amber' | 'red' {
  if (!kind) return 'red';
  if (
    kind === 'openai_env' ||
    kind === 'openai_quota_billing' ||
    kind === 'openai_invalid_key' ||
    kind === 'openai_permission' ||
    kind === 'openai_rate_limit'
  ) {
    return 'amber';
  }
  return 'red';
}

export function ExtractionFailurePanel({
  error,
  failureKind,
  cardId,
  onRetry,
  onManualEntry,
  retrying,
}: {
  error: string;
  failureKind: string | null;
  cardId: string;
  onRetry: () => void;
  onManualEntry: () => void;
  retrying: boolean;
}) {
  const tone = failureBannerTone(failureKind);
  const isApiConfig = tone === 'amber';
  const isNoScreenshots = failureKind === 'no_screenshots';

  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div
          className={
            tone === 'amber'
              ? 'rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
              : 'rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]'
          }
        >
          <div className="flex items-start gap-3">
            <div
              className={
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ' +
                (tone === 'amber' ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-red-500/20 bg-red-500/10 text-red-200')
              }
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight text-fg">
                {isNoScreenshots ? 'No screenshots yet' : isApiConfig ? 'Connection to OpenAI' : 'Extraction did not finish'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{error}</p>
              {failureKind ? (
                <p className="mt-3 font-mono text-[10px] text-fg-muted/60">ref: {failureKind}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {!isNoScreenshots ? (
              <button
                type="button"
                disabled={retrying}
                onClick={onRetry}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-bg shadow-sm transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                {retrying ? 'Retrying…' : 'Try again'}
              </button>
            ) : null}
            <Link
              href={`/cards/${cardId}`}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border bg-bg-muted px-5 text-sm font-medium text-fg transition hover:bg-bg-elevated/80 sm:flex-none"
            >
              Add screenshots on card
            </Link>
            {!isNoScreenshots ? (
              <button
                type="button"
                onClick={onManualEntry}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border/80 px-5 text-sm text-fg-muted transition hover:border-border hover:text-fg sm:flex-none"
              >
                Enter details manually
              </button>
            ) : null}
          </div>

          <div className="mt-5 text-center">
            <Link href={`/cards/${cardId}`} className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              Back to card
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
