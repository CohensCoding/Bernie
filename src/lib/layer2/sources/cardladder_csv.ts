/**
 * Card Ladder CSV importer — Phase 4 stub.
 *
 * Real implementation parses a Card Ladder export and writes rows to
 * `card_comps` with source `card_ladder_manual`. Each row already
 * represents a completed sale.
 */

import type { RawComp } from '@/lib/layer2/types';

export async function parseCardLadderCsv(_csv: string): Promise<RawComp[]> {
  return [];
}
