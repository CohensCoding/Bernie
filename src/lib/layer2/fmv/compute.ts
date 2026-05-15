/**
 * FMV computation orchestrator. Methodology v1.0.0.
 *
 * Pipeline:
 *   1. Filter input to FMV-eligible sources (drop ebay_browse, ebay_scrape, etc.)
 *   2. INSUFFICIENT_DATA gate if remaining sample size < 3
 *   3. IQR outlier rejection on raw sale prices
 *   4. INSUFFICIENT_DATA_AFTER_OUTLIERS gate if survivors < 3
 *   5. Apply recency × sale-type weighting
 *   6. Weighted mean point estimate
 *   7. Bootstrap 95% CI (uniform resample with replacement)
 *   8. Stale flag if most-recent included sale > 30 days old
 *
 * All inputs are integer cents. All dates are ISO. `nowMs` is injected
 * for deterministic tests.
 *
 * Locked at v1.0.0. Changing any step is a methodology bump.
 */

import {
  CURRENT_METHODOLOGY,
  isFmvEligibleSource,
  type Comp,
  type FmvResult,
} from '@/lib/layer2/types';
import { splitByOutliers } from '@/lib/layer2/fmv/outliers';
import {
  applyWeights,
  RECENCY_HALF_LIFE_DAYS,
  weightedMeanCents,
} from '@/lib/layer2/fmv/weighting';
import { bootstrapCi, type BootstrapOptions } from '@/lib/layer2/fmv/confidence';

export const MIN_SAMPLE_SIZE = 3;
export const STALE_THRESHOLD_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ComputeFmvOptions = {
  nowMs?: number;
  bootstrap?: BootstrapOptions;
};

/**
 * Compute FMV from a raw basket of comps. The basket should already be
 * scoped to a single (canonicalCardId, grader, grade) tuple; this function
 * does not re-filter on those keys.
 *
 * Returns a discriminated union covering OK / INSUFFICIENT_DATA /
 * INSUFFICIENT_DATA_AFTER_OUTLIERS. Only OK results should be persisted
 * to `card_fmv` (the table enforces sample_size >= 3 via a check
 * constraint).
 */
export function computeFmv(
  comps: readonly Comp[],
  opts: ComputeFmvOptions = {},
): FmvResult {
  const nowMs = opts.nowMs ?? Date.now();

  // 1. FMV-eligible source filter. Sources like ebay_browse (active
  //    listings) and ebay_scrape (unverified HTML scrape) are stored
  //    in card_comps for display but never feed FMV math.
  const eligible: Comp[] = comps.filter((c) => isFmvEligibleSource(c.source));

  // 2. Hard sample-size gate (rule + spec).
  if (eligible.length < MIN_SAMPLE_SIZE) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleSize: eligible.length,
      compsAvailable: [...eligible],
      methodologyVersion: CURRENT_METHODOLOGY,
    };
  }

  // 3. IQR outlier rejection on raw prices (not weighted prices).
  const split = splitByOutliers(eligible);

  // 4. Re-check sample size after outlier rejection. With Tukey's 1.5×
  //    IQR rule and our MIN_SAMPLE_SIZE = 3, this branch is
  //    mathematically unreachable from naturally-typed input: the IQR
  //    fences are always wide enough to keep at least the majority
  //    cluster, and majority-of-≥3 is always ≥ 2 which combined with at
  //    least one boundary value keeps survivors ≥ 3. The branch is
  //    kept as a defensive guard for future methodology revisions
  //    (tighter fences, different quantile definitions). Coverage
  //    skipped intentionally; the parallel "zero weighted mean" branch
  //    below DOES fire under FMV-eligible inputs that contain only
  //    zero-weight sale types, and that one is tested.
  /* c8 ignore start */
  if (split.included.length < MIN_SAMPLE_SIZE) {
    return {
      status: 'INSUFFICIENT_DATA_AFTER_OUTLIERS',
      sampleSize: split.included.length,
      compsAvailable: [...split.included],
      compsExcluded: [...split.excluded],
      methodologyVersion: CURRENT_METHODOLOGY,
    };
  }
  /* c8 ignore stop */

  // 5. Recency × sale-type weighting.
  const weighted = applyWeights(split.included, nowMs);

  // 6. Weighted mean (point estimate). If every comp is zero-weight
  //    (e.g. all `active_listing` snuck past the source filter) we treat
  //    that as INSUFFICIENT_DATA_AFTER_OUTLIERS — we have no signal.
  const mean = weightedMeanCents(weighted);
  if (mean == null) {
    return {
      status: 'INSUFFICIENT_DATA_AFTER_OUTLIERS',
      sampleSize: 0,
      compsAvailable: [...split.included],
      compsExcluded: [...split.excluded],
      methodologyVersion: CURRENT_METHODOLOGY,
    };
  }

  // 7. Bootstrap 95% CI (uniform resample with replacement, weights
  //    stay attached). See docs/LAYER_2_DECISIONS.md D5.
  const ci = bootstrapCi(weighted, opts.bootstrap);

  // 8. Stale flag from most-recent included sale.
  const mostRecentMs = Math.max(...split.included.map((c) => Date.parse(c.saleDate)));
  const daysSinceLast = (nowMs - mostRecentMs) / MS_PER_DAY;
  const isStale = daysSinceLast > STALE_THRESHOLD_DAYS;

  // Date range from the included basket.
  const includedMsAsc = split.included
    .map((c) => Date.parse(c.saleDate))
    .sort((a, b) => a - b);
  const dateRangeStart = isoDate(includedMsAsc[0]!);
  const dateRangeEnd = isoDate(includedMsAsc[includedMsAsc.length - 1]!);

  // Reliability invariant: round in a way that preserves
  // ci_low <= fmv <= ci_high.
  const fmvCents = Math.round(mean);
  const ciLowCents = Math.min(ci.ciLowCents, fmvCents);
  const ciHighCents = Math.max(ci.ciHighCents, fmvCents);

  return {
    status: 'OK',
    fmvCents,
    ciLowCents,
    ciHighCents,
    sampleSize: split.included.length,
    compsUsed: [...split.included],
    compsExcluded: [...split.excluded],
    isStale,
    daysSinceLastSale: daysSinceLast,
    dateRangeStart,
    dateRangeEnd,
    methodologyVersion: CURRENT_METHODOLOGY,
  };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export { RECENCY_HALF_LIFE_DAYS };
