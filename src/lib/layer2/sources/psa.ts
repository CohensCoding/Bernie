/**
 * PSA Public API — Phase 4 stub. The real implementation will fetch pop
 * reports and certificate lookups, not sales comps; the data model for
 * "PSA pop info" is therefore likely additive to `card_comps`. Spec note.
 */

import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';

export const psaSource: CompSource = {
  id: 'psa',
  isAvailable(): boolean {
    return false;
  },
  async fetchComps(_q: CompQuery): Promise<CompFetchResult> {
    return { ok: true, source: 'psa', comps: [] };
  },
};
