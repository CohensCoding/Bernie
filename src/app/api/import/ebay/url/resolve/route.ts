import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseEbayListingUrl } from '@/lib/ebay/url';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const BodySchema = z.object({
  url: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });

    const r = parseEbayListingUrl(parsed.data.url);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

    // Duplicate detection: if we already imported this item id, warn and link the card.
    const supabase = getSupabaseServerClient();
    const { data: existing, error } = await supabase
      .from('card_transactions')
      .select('card_id')
      .ilike('source_url', `%/itm/${r.itemId}%`)
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      itemId: r.itemId,
      canonicalUrl: r.canonicalUrl,
      duplicateCardId: existing?.card_id ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

