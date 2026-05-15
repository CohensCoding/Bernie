/**
 * Source adapter interface for Layer 2 comp ingest.
 *
 * Every external comp source — official APIs, scrapers, CSV importers,
 * stubs — implements this shape. The `name` is the same constant the
 * adapter uses for `RawComp.source` so the route layer can build a
 * per-source breakdown without knowing the implementations.
 */

import type { CompSourceId, Grade, Grader, RawComp } from '@/lib/layer2/types';

/**
 * Inputs that scope a comp query to a specific (card, grade) pair.
 *
 * Adapters that don't natively understand canonical ids (most scrapers)
 * use `player`, `year`, `setName`, `parallel`, etc. to build their own
 * search query and then label the resulting rows with the supplied
 * `canonicalId`.
 */
export type CompQuery = {
  canonicalId: string;
  player: string;
  year: number;
  setName: string;
  cardNumber?: string;
  parallel?: string;
  grader: Grader;
  grade: Grade;
  /**
   * Optional lookback window in days. Adapters that don't support a
   * server-side date filter (e.g. HTML scrapers) should still respect
   * this as a client-side filter before returning. Defaults to 90.
   */
  daysBack?: number;
};

export const DEFAULT_DAYS_BACK = 90;

/**
 * Per-source fetch result.
 *
 *  - `ok: true`  comps returned (possibly empty).
 *  - `ok: false` the adapter failed before producing any data. Callers
 *    use this to mark the source as "degraded" without losing comps from
 *    other sources (rule 8 — graceful degradation).
 */
export type CompFetchResult =
  | { ok: true; source: CompSourceId; comps: RawComp[] }
  | { ok: false; source: CompSourceId; reason: string };

export interface CompSource {
  readonly id: CompSourceId;
  /**
   * Whether this source is eligible to be queried at all in the current
   * environment (e.g. missing API key, or feature-flagged off). Adapters
   * report this so the orchestrator can skip them cleanly.
   */
  isAvailable(): boolean;
  fetchComps(query: CompQuery): Promise<CompFetchResult>;
}
