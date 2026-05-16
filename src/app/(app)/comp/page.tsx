import Link from 'next/link';

import { Card, CardHeader } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default function CompLookupPage() {
  return (
    <div className="mx-auto max-w-lg space-y-8 pb-16">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Layer 2</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Comp lookup</h1>
        <p className="text-sm leading-relaxed text-fg-muted">
          Type what&apos;s on the slab or sleeve. Add grade separately — we parse the query with that fixed.
          Camera capture arrives in Phase 3.
        </p>
      </header>

      <Card>
        <CardHeader title="Search" subtitle="Mobile-first — big fields, thumb-friendly taps." />

        <form action="/comp/result" method="get" className="mt-5 flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg">Card query</span>
            <input
              name="q"
              type="search"
              required
              minLength={2}
              maxLength={300}
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="words"
              placeholder="e.g. 2018 Panini Prizm Luka Doncic Silver"
              className="w-full rounded-xl border border-border bg-bg-muted/30 px-4 py-4 text-base text-fg placeholder:text-fg-muted/70 focus:border-accent/55 focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg">Grade (optional)</span>
            <input
              name="grade"
              type="text"
              maxLength={40}
              placeholder="PSA 10"
              className="w-full rounded-xl border border-border bg-bg-muted/30 px-4 py-4 text-base text-fg placeholder:text-fg-muted/70 focus:border-accent/55 focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>

          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground shadow-sm ring-1 ring-black/10 transition hover:opacity-[0.98] active:translate-y-[0.5px]"
          >
            Look up comps
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-fg-muted">
          <Link href="/comp" className="text-accent transition hover:text-accent">
            Cancel / reset
          </Link>
        </p>
      </Card>
    </div>
  );
}
