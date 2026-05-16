import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { ReactNode } from 'react';

import { SaveToPortfolioButton } from '@/app/(app)/comp/SaveToPortfolioButton';
import { Card, CardHeader } from '@/components/ui/Card';
import {
  CompLookupBodySchema,
  performCompLookup,
  type CompLookupOk,
} from '@/lib/layer2/lookup/performLookup';
import { formatUsdFromCents } from '@/lib/money';
import type { Comp } from '@/lib/layer2/types';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ q?: string; grade?: string }> };

const SALE_LABEL: Record<string, string> = {
  auction: 'auctions',
  bin: 'BIN',
  best_offer_accepted: 'BO accepted',
  active_listing: 'active listings',
  unknown: 'unknown',
};

function saleMixLine(comps: Comp[]): string {
  const m = new Map<string, number>();
  for (const c of comps) {
    const k = c.saleType ?? 'unknown';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const order = ['auction', 'bin', 'best_offer_accepted', 'active_listing', 'unknown'] as const;
  const parts: string[] = [];
  for (const k of order) {
    const n = m.get(k);
    if (n) parts.push(`${n} ${SALE_LABEL[k]}`);
  }
  for (const [k, n] of m.entries()) {
    if ((order as readonly string[]).includes(k)) continue;
    parts.push(`${n} ${k.replace(/_/g, ' ')}`);
  }
  return parts.join(' · ');
}

function recentEligibleComps(data: CompLookupOk): Comp[] {
  if (data.status === 'OK') return [...data.compsUsed];
  return [...data.compsAvailable];
}

function allSaleMixRows(data: CompLookupOk): Comp[] {
  if (data.status === 'OK') {
    return [...data.compsUsed, ...data.compsExcluded, ...data.referenceComps];
  }
  const excl = data.compsExcluded ?? [];
  return [...data.compsAvailable, ...excl, ...data.referenceComps];
}

function Badge({ tone, label }: { tone: 'ok' | 'amber' | 'orange'; label: string }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/35 dark:text-emerald-200 dark:ring-emerald-400/35'
      : tone === 'amber'
        ? 'bg-amber-500/15 text-amber-900 ring-amber-400/35 dark:text-amber-100 dark:ring-amber-400/35'
        : 'bg-orange-500/15 text-orange-950 ring-orange-400/35 dark:text-orange-100 dark:ring-orange-400/35';
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function StatusBadges({ data }: { data: CompLookupOk }) {
  if (data.status !== 'OK') {
    return <Badge tone="amber" label="INSUFFICIENT_DATA" />;
  }
  return (
    <>
      <Badge tone="ok" label="OK" />
      {data.isStale ? <Badge tone="orange" label="STALE" /> : null}
    </>
  );
}

function CompRow({ c, footer }: { c: Comp; footer?: ReactNode }) {
  return (
    <li className="border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lg font-semibold text-fg">{formatUsdFromCents(c.salePriceCents)}</span>
        <span className="text-sm text-fg-muted">{c.saleDate}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-fg-muted">
        <span className="rounded-md bg-bg-muted/50 px-2 py-0.5 text-fg ring-1 ring-border/70">{c.saleType}</span>
        <span className="rounded-md bg-bg-muted/40 px-2 py-0.5 ring-1 ring-border/60">{c.source.replace(/_/g, ' ')}</span>
        {c.listingUrl ? (
          <a
            href={c.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            Listing
          </a>
        ) : null}
      </div>
      {footer ? <div className="mt-2 text-xs text-fg-muted">{footer}</div> : null}
    </li>
  );
}

export default async function CompResultPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  if (q.length < 2) redirect('/comp');

  const validated = CompLookupBodySchema.safeParse({ query: q, grade: sp.grade?.trim() || undefined });
  if (!validated.success) redirect('/comp');

  const out = await performCompLookup(validated.data);
  if (!out.ok) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-12">
        <Card>
          <CardHeader title="Could not lookup" subtitle="Identity parse failed." />
          <p className="mt-4 text-sm text-red-700 dark:text-red-300">{out.error}</p>
          <Link href="/comp" className="mt-6 inline-flex text-accent">
            ← New lookup
          </Link>
        </Card>
      </div>
    );
  }

  const data = out.data;

  const recent = [...recentEligibleComps(data)].sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  const refs = [...data.referenceComps].sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  const excluded = data.status === 'OK' ? data.compsExcluded : (data.compsExcluded ?? []);

  const mix = saleMixLine(allSaleMixRows(data));

  return (
    <div className="mx-auto max-w-lg space-y-8 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadges data={data} />
        <span className="inline-flex rounded-full bg-bg-muted/40 px-3 py-1 text-xs font-medium text-fg-muted ring-1 ring-border/70">
          {data.methodologyVersion}
        </span>
      </div>

      <Card>
        <CardHeader title={`${data.identity.year} ${data.identity.setName}`} subtitle={data.identity.player} />
        <p className="mt-4 text-sm text-fg-muted">
          {[data.identity.parallel, `${data.identity.grader} ${data.identity.grade}`, data.identity.cardNumber ? `#${data.identity.cardNumber}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-2 break-all font-mono text-[10px] leading-snug text-fg-muted/80">{data.canonicalCardId}</p>
      </Card>

      {data.status === 'OK' ? (
        <div className="rounded-2xl border border-border/80 bg-bg-elevated/50 px-5 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">Fair market value</div>
          <div className="mt-3 grid gap-3">
            <div className="text-4xl font-semibold tracking-tight text-fg">{formatUsdFromCents(data.fmvCents)}</div>
            <div className="text-2xl font-semibold text-fg">
              95% CI {formatUsdFromCents(data.ciLowCents)} — {formatUsdFromCents(data.ciHighCents)}
            </div>
            <div className="text-2xl font-semibold text-fg">
              Sample size {data.sampleSize}{' '}
              <span className="font-medium text-fg-muted"> ({data.dateRangeStart} → {data.dateRangeEnd})</span>
            </div>
          </div>
        </div>
      ) : (
        <Card className="border-amber-500/35 bg-amber-500/[0.06] dark:bg-amber-500/[0.08]">
          <CardHeader title="Insufficient data — no FMV" subtitle={`Need ≥ 3 FMV-eligible comps (methodology ${data.methodologyVersion}).`} />
          <p className="mt-4 text-sm text-fg-muted">
            FMV-eligible comps counted in-window:{' '}
            <span className="font-semibold tabular-nums text-fg">{data.sampleSize}</span>. Reference listings below are labeled
            and never feed FMV v{data.methodologyVersion}.
          </p>
        </Card>
      )}

      <section>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Sale type breakdown</div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-xl border border-border/70 bg-bg-muted/35 px-3 py-2 text-fg">{mix || '—'}</span>
        </div>
      </section>

      <section>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Recent comps ({recent.length})</div>
        <ul className="rounded-2xl border border-border/80 bg-bg-elevated/40 px-4">
          {recent.length === 0 ? (
            <li className="py-8 text-center text-sm text-fg-muted">No comps in this slice.</li>
          ) : (
            recent.map((c) => <CompRow key={`${c.id}-${c.source}-${c.saleDate}`} c={c} />)
          )}
        </ul>
      </section>

      <section>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">
          Reference: current listings (not used in FMV) ({refs.length})
        </div>
        <ul className="rounded-2xl border border-border/60 bg-bg-muted/20 px-4">
          {refs.length === 0 ? (
            <li className="py-8 text-center text-sm text-fg-muted">No Browse / reference-only rows.</li>
          ) : (
            refs.map((c) => <CompRow key={`ref-${c.id}-${c.source}`} c={c} />)
          )}
        </ul>
      </section>

      {excluded.length > 0 ? (
        <details className="rounded-2xl border border-border bg-bg-elevated/30 px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-fg">
            Excluded comps ({excluded.length})
          </summary>
          <p className="mt-2 text-xs text-fg-muted">
            Tukey IQR fences on raw sold prices (methodology v{data.methodologyVersion}). Each row excluded from weighted FMV —
            listed here per reliability rules.
          </p>
          <ul className="mt-4 border-t border-border/70 pt-2">
            {excluded.map((c) => (
              <CompRow
                key={c.id}
                c={c}
                footer="Excluded reason: Tukey/IQR fences on raw salePriceCents (outside lower/upper fence vs included cluster)."
              />
            ))}
          </ul>
        </details>
      ) : null}

      <Card>
        <CardHeader title="Transparency" subtitle="Computation + ingestion metadata" />
        <ul className="mt-3 space-y-1 text-xs text-fg-muted">
          <li>Computed at {data.computedAt}</li>
          <li>Cache hit: {data.cacheHit ? 'yes' : 'no'}</li>
          <li>
            Warnings:{' '}
            {data.warnings.length ? data.warnings.map((w) => w.message).join(' · ') : 'none'}
          </li>
        </ul>
      </Card>

      <SaveToPortfolioButton canonicalCardId={data.canonicalCardId} identity={data.identity} />

      <Link href="/comp" className="block text-center text-sm text-accent">
        ← New lookup
      </Link>
    </div>
  );
}
