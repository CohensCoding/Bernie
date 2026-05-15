/**
 * IQR-based outlier detection. Methodology v1.0.0.
 *
 * Computed on RAW sale prices (not weighted prices) by design — see
 * docs/LAYER_2_DECISIONS.md "Open methodology notes." Changing this would
 * be a methodology bump.
 *
 * Fence rule: [Q1 - 1.5*IQR, Q3 + 1.5*IQR]. Tukey's standard.
 */

import type { Comp } from '@/lib/layer2/types';

/**
 * Linear-interpolated quantile. p in [0, 1]. Returns null for empty input.
 * Uses the type-7 (R default) definition so two implementations of the
 * same fences agree exactly for our test fixtures.
 */
export function quantile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p < 0 || p > 1 || !Number.isFinite(p)) {
    throw new RangeError(`quantile p must be in [0,1], got ${p}`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export type IqrFences = {
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
};

/**
 * Compute IQR fences from raw integer cents. Requires at least 1 value
 * (the caller is responsible for the sample-size gate; this helper just
 * computes the math).
 */
export function iqrFences(pricesCents: readonly number[]): IqrFences {
  if (pricesCents.length === 0) {
    throw new RangeError('iqrFences requires at least one price');
  }
  const q1 = quantile(pricesCents, 0.25)!;
  const q3 = quantile(pricesCents, 0.75)!;
  const iqr = q3 - q1;
  return {
    q1,
    q3,
    iqr,
    lowerFence: q1 - 1.5 * iqr,
    upperFence: q3 + 1.5 * iqr,
  };
}

export type OutlierSplit = {
  included: Comp[];
  excluded: Comp[];
  fences: IqrFences;
};

/**
 * Partition comps into "included" (inside the IQR fence) and "excluded"
 * (outside). Empty input is illegal — caller must check sample size first.
 *
 * When IQR is 0 (all prices identical), the fences collapse to a single
 * point and nothing gets excluded.
 */
export function splitByOutliers(comps: readonly Comp[]): OutlierSplit {
  if (comps.length === 0) {
    throw new RangeError('splitByOutliers requires at least one comp');
  }
  const fences = iqrFences(comps.map((c) => c.salePriceCents));
  const included: Comp[] = [];
  const excluded: Comp[] = [];
  for (const c of comps) {
    if (c.salePriceCents < fences.lowerFence || c.salePriceCents > fences.upperFence) {
      excluded.push(c);
    } else {
      included.push(c);
    }
  }
  return { included, excluded, fences };
}
