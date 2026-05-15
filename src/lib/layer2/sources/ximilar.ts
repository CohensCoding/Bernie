/**
 * Ximilar — Phase 3 stub. Phase 3 wires photo identification:
 *
 *   POST https://api.ximilar.com/collectibles/v2/sports_id
 *
 * Returns top-3 CardIdentity candidates. NEVER auto-selects the top
 * result (rule 6 — user must confirm). The Layer 2 `CardIdentity` type
 * is the canonical shape returned here.
 */

import type { CardIdentity } from '@/lib/layer2/types';

export type XimilarCandidate = {
  identity: CardIdentity;
  confidence: number; // 0..1
};

export async function identifyFromImage(_imageBase64: string): Promise<XimilarCandidate[]> {
  return [];
}
