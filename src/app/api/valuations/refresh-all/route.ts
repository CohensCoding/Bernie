import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ebaySoldValuationProvider } from '@/lib/valuation/providers/ebaySoldProvider';
import { valueCardWithProvider } from '@/lib/valuation/engine';
import { createValuationRun, finishValuationRun, persistValuation } from '@/lib/valuation/persist';
import type { CardIdentity } from '@/lib/valuation/types';

export async function POST() {
  let runId: string | null = null;
  try {
    runId = await createValuationRun({ scope: 'bulk' });
    const supabase = getSupabaseServerClient();
    const { data: cards, error } = await supabase.from('cards').select('*');
    if (error) throw new Error(error.message);

    let okCount = 0;
    let failCount = 0;

    for (const card of (cards ?? []) as any[]) {
      try {
        const identity: CardIdentity = {
          id: String(card.id),
          title_raw: card.title_raw ?? null,
          player_name: card.player_name ?? null,
          sport: card.sport ?? null,
          team: card.team ?? null,
          year: card.year ?? null,
          brand: card.brand ?? null,
          set_name: card.set_name ?? null,
          subset: card.subset ?? null,
          card_number: card.card_number ?? null,
          parallel: card.parallel ?? null,
          serial_number: card.serial_number ?? null,
          print_run: card.print_run ?? null,
          rookie: Boolean(card.rookie),
          auto: Boolean(card.auto),
          patch: Boolean(card.patch),
          graded: Boolean(card.graded),
          grading_company: card.grading_company ?? null,
          grade: card.grade ?? null,
        };
        const estimate = await valueCardWithProvider({ card: identity, provider: ebaySoldValuationProvider });
        await persistValuation({ runId, card: identity, estimate });
        okCount++;
      } catch {
        failCount++;
      }
    }

    await finishValuationRun({ runId, status: 'ok' });
    return NextResponse.json({ ok: true, run_id: runId, cards_ok: okCount, cards_failed: failCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (runId) {
      try {
        await finishValuationRun({ runId, status: 'failed', error: msg });
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

