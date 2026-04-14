import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCardDetail } from '@/lib/db/cards';
import { emptyExtractionPayload, type ExtractionPayload } from '@/types/extraction';

const QuerySchema = z.object({
  cardId: z.string().uuid(),
});

function withVal<T>(value: T | null, confidence: number | null = 0.72, evidence?: string[]): { value: T | null; confidence: number | null; evidence: string[] | null } {
  return { value, confidence, evidence: evidence?.length ? evidence : null };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ cardId: url.searchParams.get('cardId') });
  if (!parsed.success) return NextResponse.json({ error: 'Missing cardId' }, { status: 400 });

  try {
    const detail = await getCardDetail(parsed.data.cardId);
    if (!detail) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

    const latest = detail.transactions[0] ?? null;

    // This is intentionally mocked/stubbed until the real extractor is added.
    // Prefill from existing structured data when available to make the review UI useful immediately.
    const p: ExtractionPayload = emptyExtractionPayload();
    p.title_raw = withVal(detail.card.title_raw);
    p.player_name = withVal(detail.card.player_name);
    p.sport = withVal(detail.card.sport);
    p.team = withVal(detail.card.team);
    p.year = withVal(detail.card.year);
    p.brand = withVal(detail.card.brand);
    p.set_name = withVal(detail.card.set_name);
    p.subset = withVal(detail.card.subset);
    p.card_number = withVal(detail.card.card_number);
    p.parallel = withVal(detail.card.parallel);
    p.serial_number = withVal(detail.card.serial_number);
    p.print_run = withVal(detail.card.print_run);
    p.rookie = withVal(detail.card.rookie, 0.9, ['Seeded from card record']);
    p.auto = withVal(detail.card.auto, 0.9, ['Seeded from card record']);
    p.patch = withVal(detail.card.patch, 0.9, ['Seeded from card record']);
    p.graded = withVal(detail.card.graded, 0.9, ['Seeded from card record']);
    p.grading_company = withVal(detail.card.grading_company);
    p.grade = withVal(detail.card.grade);
    p.notes = withVal(detail.card.notes, 0.55);

    if (latest) {
      p.platform = withVal(latest.platform, 0.8);
      p.source_url = withVal(latest.source_url, 0.7);
      p.purchase_date = withVal(latest.purchase_date, 0.75);
      p.purchase_price = withVal(latest.purchase_price_cents / 100, 0.8);
      p.taxes = withVal(latest.taxes_cents / 100, 0.8);
      p.shipping = withVal(latest.shipping_cents / 100, 0.8);
      p.total_cost = withVal(latest.total_cost_cents / 100, 0.85);
      p.title_raw = withVal(latest.title_raw ?? detail.card.title_raw, 0.75);
    } else {
      // Provide a tiny bit of “mock extraction” flavor even when there’s no transaction yet.
      p.platform = withVal('eBay', 0.4, ['Mocked default']);
    }

    return NextResponse.json({ ok: true, extraction: p });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

