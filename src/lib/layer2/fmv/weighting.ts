/**
 * Recency × sale-type weighting. Methodology v1.0.0.
 *
 * Recency: exponential decay with a 30-day half-life.
 *   weight = 0.5 ^ (ageDays / 30)
 *
 * Sale type:
 *   auction              1.0   "true" market clear via competition
 *   best_offer_accepted  1.0   negotiated clear; same signal as auction
 *   bin                  0.7   may be aspirational
 *   active_listing       0.0   listings ≠ sales; filtered upstream, but
 *                              this guard keeps math honest if one slips through
 *   unknown              0.5   fail-safe
 *
 * Locked at v1.0.0. Changing any constant here is a methodology bump.
 */

import type { Comp, SaleType, WeightedComp } from '@/lib/layer2/types';

export const RECENCY_HALF_LIFE_DAYS = 30;

export const SALE_TYPE_WEIGHT: Record<SaleType, number> = {
  auction: 1.0,
  best_offer_accepted: 1.0,
  bin: 0.7,
  active_listing: 0.0,
  unknown: 0.5,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Recency multiplier for a single sale. `nowMs` is injected so tests can
 * pin the clock; callers in production pass `Date.now()`.
 */
export function recencyWeight(saleDateIso: string, nowMs: number): number {
  const saleMs = Date.parse(saleDateIso);
  if (!Number.isFinite(saleMs)) {
    throw new RangeError(`recencyWeight: invalid saleDate '${saleDateIso}'`);
  }
  const ageDays = Math.max(0, (nowMs - saleMs) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Apply recency × sale-type weighting to a basket of comps. Order
 * preserved.
 */
export function applyWeights(comps: readonly Comp[], nowMs: number): WeightedComp[] {
  return comps.map((c) => {
    const r = recencyWeight(c.saleDate, nowMs);
    // The `?? SALE_TYPE_WEIGHT.unknown` fallback is a defensive guard for
    // SaleType values outside the closed union. With proper typing it is
    // unreachable; we keep it so an unanticipated DB string can never
    // crash the math. Coverage skipped intentionally.
    /* c8 ignore next */
    const t = SALE_TYPE_WEIGHT[c.saleType] ?? SALE_TYPE_WEIGHT.unknown;
    return {
      ...c,
      recencyWeight: r,
      saleTypeWeight: t,
      weight: r * t,
    };
  });
}

/**
 * Weighted mean of cents. Returns `null` for empty input or zero total
 * weight (e.g. an all-`active_listing` basket); callers should treat
 * zero-weight buckets as INSUFFICIENT_DATA upstream.
 */
export function weightedMeanCents(weighted: readonly WeightedComp[]): number | null {
  if (weighted.length === 0) return null;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of weighted) {
    totalWeight += c.weight;
    weightedSum += c.salePriceCents * c.weight;
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}
