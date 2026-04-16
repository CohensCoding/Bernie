import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ebaySoldValuationProvider } from '@/lib/valuation/providers/ebaySoldProvider';
import { valueCardWithProvider } from '@/lib/valuation/engine';
import { createValuationRun, finishValuationRun, persistValuation } from '@/lib/valuation/persist';
import type { CardIdentity } from '@/lib/valuation/types';

const BodySchema = z.object({
  card_id: z.string().uuid().optional(),
  cardId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  let runId: string | null = null;
  try {
    const json = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    const cardId = parsed.data.card_id ?? parsed.data.cardId;
    if (!cardId) return NextResponse.json({ error: 'Missing card id.' }, { status: 400 });

    runId = await createValuationRun({ scope: 'single' });

    const supabase = getSupabaseServerClient();
    const { data: card, error } = await supabase.from('cards').select('*').eq('id', cardId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!card) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });

    const identity: CardIdentity = {
      id: String((card as any).id),
      title_raw: (card as any).title_raw ?? null,
      player_name: (card as any).player_name ?? null,
      sport: (card as any).sport ?? null,
      team: (card as any).team ?? null,
      year: (card as any).year ?? null,
      brand: (card as any).brand ?? null,
      set_name: (card as any).set_name ?? null,
      subset: (card as any).subset ?? null,
      card_number: (card as any).card_number ?? null,
      parallel: (card as any).parallel ?? null,
      serial_number: (card as any).serial_number ?? null,
      print_run: (card as any).print_run ?? null,
      rookie: Boolean((card as any).rookie),
      auto: Boolean((card as any).auto),
      patch: Boolean((card as any).patch),
      graded: Boolean((card as any).graded),
      grading_company: (card as any).grading_company ?? null,
      grade: (card as any).grade ?? null,
    };

    const estimate = await valueCardWithProvider({ card: identity, provider: ebaySoldValuationProvider });
    await persistValuation({ runId, card: identity, estimate });
    await finishValuationRun({ runId, status: 'ok' });

    return NextResponse.json({ ok: true, run_id: runId, valuation: estimate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (runId) {
      try {
        await finishValuationRun({ runId, status: 'failed', error: msg });
      } catch {
        // ignore secondary failure
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

