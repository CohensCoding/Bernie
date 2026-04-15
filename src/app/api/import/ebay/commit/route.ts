import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const BodySchema = z
  .object({
    purchase: z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      purchasedAt: z.string().nullable().optional(),
      totalCostCents: z.number().int().nonnegative(),
      currency: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      external: z
        .object({
          orderId: z.string().nullable().optional(),
          transactionId: z.string().nullable().optional(),
          itemId: z.string().nullable().optional(),
          listingUrl: z.string().nullable().optional(),
        })
        .optional(),
      raw: z.unknown().optional(),
    }),
    card: z
      .object({
        title_raw: z.string().nullable().optional(),
        player_name: z.string().nullable().optional(),
        sport: z.string().nullable().optional(),
        team: z.string().nullable().optional(),
        year: z.number().int().nullable().optional(),
        brand: z.string().nullable().optional(),
        set_name: z.string().nullable().optional(),
        subset: z.string().nullable().optional(),
        card_number: z.string().nullable().optional(),
        parallel: z.string().nullable().optional(),
        serial_number: z.number().int().nullable().optional(),
        print_run: z.number().int().nullable().optional(),
        rookie: z.boolean().optional(),
        auto: z.boolean().optional(),
        patch: z.boolean().optional(),
        graded: z.boolean().optional(),
        grading_company: z.string().nullable().optional(),
        grade: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .strict(),
    transaction: z
      .object({
        purchase_date: z.string().nullable().optional(),
        purchase_price_cents: z.number().int().nonnegative(),
        taxes_cents: z.number().int().nonnegative(),
        shipping_cents: z.number().int().nonnegative(),
        total_cost_cents: z.number().int().nonnegative(),
        notes: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const { purchase, card, transaction } = parsed.data;

    const externalId = purchase.id.replace(/^ebay:/, '');

    // Dedupe: source+external_id unique
    const { data: existing, error: existErr } = await supabase
      .from('card_imports')
      .select('card_id')
      .eq('source', 'ebay')
      .eq('external_id', externalId)
      .maybeSingle();
    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (existing?.card_id) {
      return NextResponse.json({ error: 'This eBay purchase was already imported.', card_id: existing.card_id }, { status: 409 });
    }

    // Create card
    const { data: newCard, error: cardErr } = await supabase.from('cards').insert({
      ...card,
      rookie: card.rookie ?? false,
      auto: card.auto ?? false,
      patch: card.patch ?? false,
      graded: card.graded ?? false,
      card_type_tags: [],
    }).select('id').single();
    if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 });

    // Create transaction
    const { data: tx, error: txErr } = await supabase
      .from('card_transactions')
      .insert({
        card_id: newCard.id,
        platform: 'eBay',
        source_url: purchase.external?.listingUrl ?? null,
        title_raw: purchase.title,
        purchase_date: transaction.purchase_date ?? purchase.purchasedAt ?? null,
        purchase_price_cents: transaction.purchase_price_cents,
        taxes_cents: transaction.taxes_cents,
        shipping_cents: transaction.shipping_cents,
        total_cost_cents: transaction.total_cost_cents,
        notes: transaction.notes ?? null,
      })
      .select('id')
      .single();
    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    // Record import metadata
    const { error: impErr } = await supabase.from('card_imports').insert({
      card_id: newCard.id,
      transaction_id: tx.id,
      source: 'ebay',
      external_id: externalId,
      external_url: purchase.external?.listingUrl ?? null,
      external_title: purchase.title,
      image_url: purchase.imageUrl ?? null,
      purchased_at: (purchase.purchasedAt ?? null) as any,
      total_cost_cents: purchase.totalCostCents,
      currency: purchase.currency ?? null,
      raw: purchase.raw ?? null,
    });
    if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, card_id: newCard.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

