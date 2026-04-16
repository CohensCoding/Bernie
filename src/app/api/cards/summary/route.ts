import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const QuerySchema = z.object({
  id: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ id: url.searchParams.get('id') ?? '' });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const { data: card, error: cardErr } = await supabase.from('cards').select('*').eq('id', parsed.data.id).maybeSingle();
    if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 });
    if (!card) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });

    const { data: txs, error: txErr } = await supabase
      .from('card_transactions')
      .select('*')
      .eq('card_id', parsed.data.id)
      .order('purchase_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);
    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, card, latestTransaction: (txs ?? [])[0] ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

