import type { CardIdentity, ValuationEstimate } from '@/lib/valuation/types';
import type { ValuationProvider } from '@/lib/valuation/providers/provider';

/**
 * Thin orchestration layer: providers do matching; engine standardizes output and guards.
 * This keeps future provider swaps low-risk.
 */
export async function valueCardWithProvider(args: {
  card: CardIdentity;
  provider: ValuationProvider;
}): Promise<ValuationEstimate> {
  const out = await args.provider.valueCard(args.card);
  // Basic sanity: ensure cents are non-negative when present.
  const clampCents = (n: number | null) => (n != null && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null);
  const clampCount = (n: number | null) =>
    n != null && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
  return {
    ...out,
    low_cents: clampCents(out.low_cents),
    mid_cents: clampCents(out.mid_cents),
    high_cents: clampCents(out.high_cents),
    last_comp_price_cents: clampCents(out.last_comp_price_cents),
    comp_count: clampCount(out.comp_count),
  };
}

