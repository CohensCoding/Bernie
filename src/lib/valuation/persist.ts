import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { CardIdentity, ValuationEstimate } from '@/lib/valuation/types';

export async function createValuationRun(args: { scope: 'single' | 'bulk' }): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('valuation_runs')
    .insert({ scope: args.scope, status: 'running' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function finishValuationRun(args: { runId: string; status: 'ok' | 'failed'; error?: string | null }) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('valuation_runs')
    .update({
      status: args.status,
      finished_at: new Date().toISOString(),
      error: args.error ?? null,
    })
    .eq('id', args.runId);
  if (error) throw new Error(error.message);
}

export async function persistValuation(args: {
  runId: string | null;
  card: CardIdentity;
  estimate: ValuationEstimate;
}) {
  const supabase = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  // Upsert current valuation.
  const currentRow = {
    card_id: args.card.id,
    provider: args.estimate.provider,
    confidence: args.estimate.confidence,
    status: args.estimate.status,
    match_notes: args.estimate.match_notes,
    low_cents: args.estimate.low_cents,
    mid_cents: args.estimate.mid_cents,
    high_cents: args.estimate.high_cents,
    last_comp_price_cents: args.estimate.last_comp_price_cents,
    last_comp_date: args.estimate.last_comp_date,
    comp_count: args.estimate.comp_count,
    last_valued_at: nowIso,
    last_run_id: args.runId,
    last_error: args.estimate.status === 'error' ? args.estimate.match_notes : null,
  };

  const { error: upErr } = await supabase
    .from('card_valuations_current')
    .upsert(currentRow, { onConflict: 'card_id' });
  if (upErr) throw new Error(upErr.message);

  // Snapshot append.
  const { error: snapErr } = await supabase.from('card_valuation_snapshots').insert({
    card_id: args.card.id,
    run_id: args.runId,
    provider: args.estimate.provider,
    confidence: args.estimate.confidence,
    status: args.estimate.status,
    match_notes: args.estimate.match_notes,
    low_cents: args.estimate.low_cents,
    mid_cents: args.estimate.mid_cents,
    high_cents: args.estimate.high_cents,
    last_comp_price_cents: args.estimate.last_comp_price_cents,
    last_comp_date: args.estimate.last_comp_date,
    comp_count: args.estimate.comp_count,
    valued_at: nowIso,
  });
  if (snapErr) throw new Error(snapErr.message);
}

