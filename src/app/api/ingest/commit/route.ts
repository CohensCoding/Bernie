import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const CommitSchema = z.object({
  card_id: z.string().uuid(),
  // card fields
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
  // transaction fields
  transaction: z
    .object({
      platform: z.string().nullable().optional(),
      source_url: z.string().nullable().optional(),
      title_raw: z.string().nullable().optional(),
      purchase_date: z.string().nullable().optional(), // YYYY-MM-DD
      purchase_price_cents: z.number().int().nonnegative(),
      taxes_cents: z.number().int().nonnegative(),
      shipping_cents: z.number().int().nonnegative(),
      total_cost_cents: z.number().int().nonnegative(),
      notes: z.string().nullable().optional(),
    })
    .strict(),
  asset_ids: z.array(z.string().uuid()).default([]),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = CommitSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const { card_id, card, transaction, asset_ids } = parsed.data;

    // Update card (card already exists because uploads are attached to an existing card in Layer 1)
    const { error: cardErr } = await supabase.from('cards').update(card).eq('id', card_id);
    if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 });

    // Create transaction
    const { data: tx, error: txErr } = await supabase
      .from('card_transactions')
      .insert({ ...transaction, card_id })
      .select('id')
      .single();
    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    // Link selected assets to this transaction (and ensure card_id stays linked)
    if (asset_ids.length > 0) {
      const { error: assetErr } = await supabase
        .from('card_assets')
        .update({ card_id, transaction_id: tx.id })
        .in('id', asset_ids);
      if (assetErr) return NextResponse.json({ error: assetErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, card_id, transaction_id: tx.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

