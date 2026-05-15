/**
 * Card Hedge AI — Phase 4 stub.
 *
 * Real integration deferred per spec phase plan. Returns no comps so the
 * orchestrator treats this source as unavailable.
 */

import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';

export const cardHedgeSource: CompSource = {
  id: 'cardhedge',
  isAvailable(): boolean {
    return false;
  },
  async fetchComps(_q: CompQuery): Promise<CompFetchResult> {
    return { ok: true, source: 'cardhedge', comps: [] };
  },
};
