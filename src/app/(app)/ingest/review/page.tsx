import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { getCardDetail } from '@/lib/db/cards';
import { ExtractionReviewForm } from '@/components/ingest/ExtractionReviewForm';
import { emptyExtractionPayload } from '@/types/extraction';
import { buildMockExtraction } from '@/lib/ingest/mockExtraction';
import { headers } from 'next/headers';
import type { ExtractionPayload } from '@/types/extraction';

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

  const extraction = detail ? await getRealExtraction(detail.card.id) : emptyExtractionPayload();

  const assets =
    detail?.assets.map((a) => ({
      id: a.id,
      signed_url: a.signed_url ?? null,
      label: a.path.split('/').pop() ?? 'screenshot',
    })) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-fg-muted">
            <Link href="/portfolio" className="hover:text-fg">
              Portfolio
            </Link>
            <span className="mx-2">/</span>
            {detail ? (
              <>
                <Link href={`/cards/${detail.card.id}`} className="hover:text-fg">
                  Card
                </Link>
                <span className="mx-2">/</span>
              </>
            ) : null}
            <span className="text-fg">Review</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">Review extracted details</div>
          <div className="mt-2 text-sm text-fg-muted">
            Mock extraction for now. Edit fields, then save to create a transaction and update the card.
          </div>
        </div>
        {detail ? (
          <Link
            href={`/cards/${detail.card.id}`}
            className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg hover:bg-bg-elevated/60"
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
        <UiCard>
          <CardHeader
            title={detail.card.player_name ?? 'Card'}
            subtitle={`${detail.card.year ?? '—'} · ${detail.card.brand ?? '—'} · ${detail.card.set_name ?? '—'}`}
          />
          <div className="mt-5">
            <ExtractionReviewForm cardId={detail.card.id} assets={assets} extraction={extraction} />
          </div>
        </UiCard>
      ) : null}
    </div>
  );
}

async function getRealExtraction(cardId: string): Promise<ExtractionPayload> {
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = host ? `${proto}://${host}` : '';

  try {
    const res = await fetch(`${base}/api/ingest/extract?cardId=${cardId}`, { cache: 'no-store' });
    if (!res.ok) {
      // Dev-only fallback to mock extraction
      if (process.env.NODE_ENV === 'development') {
        const d = await getCardDetail(cardId);
        return d ? buildMockExtraction(d) : emptyExtractionPayload();
      }
      return emptyExtractionPayload();
    }
    const json = (await res.json()) as any;
    return (json?.extraction as ExtractionPayload) ?? emptyExtractionPayload();
  } catch {
    if (process.env.NODE_ENV === 'development') {
      const d = await getCardDetail(cardId);
      return d ? buildMockExtraction(d) : emptyExtractionPayload();
    }
    return emptyExtractionPayload();
  }
}

