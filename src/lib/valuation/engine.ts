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
  const clamp = (n: number | null) => (n != null && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null);
  return {
    ...out,
    low_cents: clamp(out.low_cents),
    mid_cents: clamp(out.mid_cents),
    high_cents: clamp(out.high_cents),
    last_comp_price_cents: clamp(out.last_comp_price_cents),
    comp_count: out.comp_count != null ? clamp(out.comp_count) : null,
  };
}

