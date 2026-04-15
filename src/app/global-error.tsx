'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
          <div className="text-xs font-medium uppercase tracking-[0.25em] text-fg-muted">Bernie</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight">Something went wrong</div>
          <div className="mt-3 text-sm text-fg-muted">
            Try reloading. If it keeps happening, there’s a client-side error blocking render.
          </div>
          <div className="mt-6 flex w-full gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-2xl border border-border bg-bg-muted/40 px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-bg-muted/70"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-95"
            >
              Try again
            </button>
          </div>
          {error?.digest ? (
            <div className="mt-6 rounded-xl border border-border/60 bg-bg-elevated/40 px-3 py-2 text-xs text-fg-muted">
              Error digest: <span className="font-mono text-fg">{error.digest}</span>
            </div>
          ) : null}
        </div>
      </body>
    </html>
  );
}

