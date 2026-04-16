import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const QuerySchema = z.object({
  cardId: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ cardId: url.searchParams.get('cardId') ?? '' });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid card id.' }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('card_valuations_current')
      .select('*')
      .eq('card_id', parsed.data.cardId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, valuation: data ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

