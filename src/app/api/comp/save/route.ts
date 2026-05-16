/**
 * POST /api/comp/save — persist comp lookup outcome as a Layer 1 card + purchase + canonical link.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createCardWithPurchase } from '@/lib/db/cards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  canonicalCardId: z.string().min(1).max(200),
  identity: z.object({
    player: z.string().min(1),
    year: z.number().int(),
    setName: z.string().min(1),
    cardNumber: z.string().max(40).nullable().optional(),
    parallel: z.string().max(120).nullable().optional(),
    grader: z.string().min(1).max(20),
    grade: z.string().min(1).max(40),
  }),
  purchase: z.object({
    pricePaidCents: z.number().int().nonnegative(),
    purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(4000).optional(),
  }),
});

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid body: ${parsed.error.issues.map((i) => i.message).join('; ')}` },
      { status: 400 },
    );
  }

  try {
    const { cardId } = await createCardWithPurchase({
      canonicalCardId: parsed.data.canonicalCardId,
      identity: {
        player: parsed.data.identity.player,
        year: parsed.data.identity.year,
        setName: parsed.data.identity.setName,
        cardNumber: parsed.data.identity.cardNumber ?? null,
        parallel: parsed.data.identity.parallel ?? null,
        grader: parsed.data.identity.grader,
        grade: parsed.data.identity.grade,
      },
      purchase: {
        pricePaidCents: parsed.data.purchase.pricePaidCents,
        purchaseDate: parsed.data.purchase.purchaseDate,
        notes: parsed.data.purchase.notes,
      },
    });

    const redirectUrl = `/cards/${cardId}`;
    return NextResponse.json({ cardId, redirectUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.warn(`[api/comp/save] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
