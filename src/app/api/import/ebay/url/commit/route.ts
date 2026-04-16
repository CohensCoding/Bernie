import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const BodySchema = z
  .object({
    listing: z.object({
      source: z.literal('ebay'),
      itemId: z.string().regex(/^\d{9,15}$/),
      listingUrl: z.string().url(),
      title: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      itemSpecifics: z.record(z.string(), z.string()).optional(),
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
    const { listing, card, transaction } = parsed.data;

    // Duplicate by item id (URL imports use external_id = itemId).
    const { data: existing, error: existErr } = await supabase
      .from('card_imports')
      .select('card_id')
      .eq('source', 'ebay')
      .eq('external_id', listing.itemId)
      .maybeSingle();
    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (existing?.card_id) {
      return NextResponse.json({ error: 'This eBay item was already imported.', card_id: existing.card_id }, { status: 409 });
    }
    // Also dedupe against existing transactions that already reference this item url (account imports).
    const { data: txExisting, error: txExistErr } = await supabase
      .from('card_transactions')
      .select('card_id')
      .ilike('source_url', `%/itm/${listing.itemId}%`)
      .limit(1)
      .maybeSingle();
    if (txExistErr) return NextResponse.json({ error: txExistErr.message }, { status: 500 });
    if (txExisting?.card_id) {
      return NextResponse.json({ error: 'This eBay item may already be in your collection.', card_id: txExisting.card_id }, { status: 409 });
    }

    const titleRaw = card.title_raw ?? listing.title ?? null;

    const { data: newCard, error: cardErr } = await supabase
      .from('cards')
      .insert({
        ...card,
        title_raw: titleRaw,
        rookie: card.rookie ?? false,
        auto: card.auto ?? false,
        patch: card.patch ?? false,
        graded: card.graded ?? false,
        card_type_tags: [],
      })
      .select('id')
      .single();
    if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 });

    const { data: tx, error: txErr } = await supabase
      .from('card_transactions')
      .insert({
        card_id: newCard.id,
        platform: 'eBay',
        source_url: listing.listingUrl,
        title_raw: titleRaw,
        purchase_date: transaction.purchase_date ?? null,
        purchase_price_cents: transaction.purchase_price_cents,
        taxes_cents: transaction.taxes_cents,
        shipping_cents: transaction.shipping_cents,
        total_cost_cents: transaction.total_cost_cents,
        notes: transaction.notes ?? null,
      })
      .select('id')
      .single();
    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    const { error: impErr } = await supabase.from('card_imports').insert({
      card_id: newCard.id,
      transaction_id: tx.id,
      source: 'ebay',
      // For URL imports, external_id is the item id (stable).
      external_id: listing.itemId,
      external_url: listing.listingUrl,
      external_title: titleRaw,
      image_url: listing.imageUrl ?? null,
      purchased_at: null,
      total_cost_cents: transaction.total_cost_cents,
      currency: 'USD',
      raw: {
        listing,
      },
    });
    if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, card_id: newCard.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

