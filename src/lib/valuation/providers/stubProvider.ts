import type { ValuationProvider } from '@/lib/valuation/providers/provider';

export const stubValuationProvider: ValuationProvider = {
  id: 'stub',
  async valueCard() {
    return {
      provider: 'stub',
      status: 'unavailable',
      confidence: 0,
      match_notes: 'No valuation provider configured yet.',
      low_cents: null,
      mid_cents: null,
      high_cents: null,
      last_comp_price_cents: null,
      last_comp_date: null,
      comp_count: null,
    };
  },
};

