import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCardDetail } from '@/lib/db/cards';
import { type ExtractionPayload } from '@/types/extraction';
import { buildMockExtraction } from '@/lib/ingest/mockExtraction';

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

    const p: ExtractionPayload = buildMockExtraction(detail);

    return NextResponse.json({ ok: true, extraction: p });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

