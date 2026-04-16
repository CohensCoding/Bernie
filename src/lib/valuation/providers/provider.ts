import type { CardIdentity, ValuationEstimate } from '@/lib/valuation/types';

export type ValuationProvider = {
  id: string;
  /**
   * Return a best-effort valuation estimate. Providers should be conservative:
   * prefer unavailable over guessing when match quality is poor.
   */
  valueCard: (card: CardIdentity) => Promise<ValuationEstimate>;
};

