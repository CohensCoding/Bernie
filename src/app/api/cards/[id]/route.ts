import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const CardUpdateSchema = z
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
  .strict();

const TransactionUpdateSchema = z
  .object({
    id: z.string().uuid(),
    platform: z.string().nullable().optional(),
    source_url: z.string().nullable().optional(),
    title_raw: z.string().nullable().optional(),
    purchase_date: z.string().nullable().optional(),
    purchase_price_cents: z.number().int().nonnegative().optional(),
    taxes_cents: z.number().int().nonnegative().optional(),
    shipping_cents: z.number().int().nonnegative().optional(),
    total_cost_cents: z.number().int().nonnegative().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const PatchSchema = z
  .object({
    card: CardUpdateSchema.optional(),
    transaction: TransactionUpdateSchema.optional(),
  })
  .strict()
  .refine(
    (b) => {
      const hasCard = b.card !== undefined && Object.keys(b.card).length > 0;
      const hasTx =
        b.transaction !== undefined &&
        Object.keys(b.transaction).some((k) => k !== 'id');
      return hasCard || hasTx;
    },
    { message: 'Provide at least one field to update on the card or transaction.' },
  );

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: cardId } = await ctx.params;
    const json = (await req.json()) as unknown;
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (parsed.data.card && Object.keys(parsed.data.card).length > 0) {
      const { error } = await supabase.from('cards').update(parsed.data.card).eq('id', cardId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (parsed.data.transaction) {
      const { id: txId, ...txFields } = parsed.data.transaction;
      if (Object.keys(txFields).length > 0) {
        const { data: row, error: selErr } = await supabase
          .from('card_transactions')
          .select('card_id')
          .eq('id', txId)
          .maybeSingle();
        if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
        if (!row || row.card_id !== cardId) {
          return NextResponse.json({ error: 'Transaction not found for this card.' }, { status: 400 });
        }
        const { error: upErr } = await supabase.from('card_transactions').update(txFields).eq('id', txId);
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
