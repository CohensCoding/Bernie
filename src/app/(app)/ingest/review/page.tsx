import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { getCardDetail } from '@/lib/db/cards';
import { IngestReviewClient } from '@/components/ingest/IngestReviewClient';

export const dynamic = 'force-dynamic';

export default async function IngestReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ cardId?: string }>;
}) {
  const { cardId } = await searchParams;
  if (!cardId) notFound();

  let detail: Awaited<ReturnType<typeof getCardDetail>> | null = null;
  let error: string | null = null;
  try {
    detail = await getCardDetail(cardId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }
  if (!error && !detail) notFound();

  const assets =
    detail?.assets.map((a) => ({
      id: a.id,
      signed_url: a.signed_url ?? null,
      label: a.path.split('/').pop() ?? 'screenshot',
    })) ?? [];

  const cardLabel =
    detail?.card.player_name?.trim() ||
    detail?.card.title_raw?.trim() ||
    (detail?.card.brand && detail?.card.set_name ? `${detail.card.brand} · ${detail.card.set_name}` : null) ||
    'Draft card';

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0 space-y-3">
          <nav className="text-xs text-fg-muted">
            <Link href="/cards" className="transition hover:text-fg">
              Cards
            </Link>
            <span className="mx-2 text-fg-muted/50">/</span>
            {detail ? (
              <>
                <Link href={`/cards/${detail.card.id}`} className="transition hover:text-fg">
                  Card
                </Link>
                <span className="mx-2 text-fg-muted/50">/</span>
              </>
            ) : null}
            <span className="font-medium text-fg">Review</span>
          </nav>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Step 3 · Confirm</p>
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Review extracted details</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
            We pre-filled fields from your screenshots. Adjust anything that looks off, then save—your portfolio updates
            instantly.
          </p>
        </header>
        {detail ? (
          <Link
            href={`/cards/${detail.card.id}`}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border/90 bg-bg-muted/50 px-4 py-2.5 text-sm font-medium text-fg transition hover:border-border hover:bg-bg-elevated/60"
          >
            Back to card
          </Link>
        ) : null}
      </div>

      {error ? (
        <UiCard>
          <CardHeader title="Unable to load review" subtitle="Check Supabase connection and seed/schema" />
          <div className="mt-4 text-sm text-fg-muted">{error}</div>
        </UiCard>
      ) : null}

      {detail ? (
        <UiCard className="overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
          <CardHeader
            title={cardLabel}
            subtitle="Draft · extraction runs when this page opens"
          />
          <div className="mt-8">
            <IngestReviewClient cardId={detail.card.id} assets={assets} />
          </div>
        </UiCard>
      ) : null}
    </div>
  );
}
