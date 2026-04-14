import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('cards')
      .insert({
        // draft placeholder; will be updated in review/save
        rookie: false,
        auto: false,
        patch: false,
        graded: false,
        card_type_tags: [],
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cardId: data.id as string });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

