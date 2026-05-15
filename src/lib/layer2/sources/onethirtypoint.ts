/**
 * 130point scraper — Phase 4 stub. Caching + rate-limiting required at
 * real-impl time; not yet wired.
 */

import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';

export const oneThirtyPointSource: CompSource = {
  id: '130point',
  isAvailable(): boolean {
    return false;
  },
  async fetchComps(_q: CompQuery): Promise<CompFetchResult> {
    return { ok: true, source: '130point', comps: [] };
  },
};
