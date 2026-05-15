import { describe, expect, it } from 'vitest';

import {
  RECENCY_HALF_LIFE_DAYS,
  SALE_TYPE_WEIGHT,
  applyWeights,
  recencyWeight,
  weightedMeanCents,
} from '@/lib/layer2/fmv/weighting';
import type { Comp, SaleType } from '@/lib/layer2/types';

const NOW = Date.UTC(2026, 4, 13); // 2026-05-13

function isoDaysBack(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function comp(idx: number, salePriceCents: number, daysBack: number, saleType: SaleType): Comp {
  return {
    id: `comp-${idx}`,
    canonicalCardId: 'test-card',
    source: 'ebay_marketplace_insights',
    sourceListingId: `listing-${idx}`,
    grader: 'PSA',
    grade: '10',
    salePriceCents,
    saleDate: isoDaysBack(daysBack),
    saleType,
    listingUrl: null,
    fetchedAt: new Date(NOW).toISOString(),
  };
}

describe('recencyWeight', () => {
  it('returns 1.0 for a sale "today"', () => {
    expect(recencyWeight(isoDaysBack(0), NOW)).toBeCloseTo(1.0, 6);
  });

  it('returns ~0.5 at one half-life', () => {
    expect(recencyWeight(isoDaysBack(RECENCY_HALF_LIFE_DAYS), NOW)).toBeCloseTo(0.5, 6);
  });

  it('returns ~0.25 at two half-lives', () => {
    expect(recencyWeight(isoDaysBack(60), NOW)).toBeCloseTo(0.25, 6);
  });

  it('treats future-dated comps as weight 1.0 (clamped age=0)', () => {
    expect(recencyWeight(isoDaysBack(-5), NOW)).toBe(1);
  });

  it('throws on bad date strings', () => {
    expect(() => recencyWeight('not-a-date', NOW)).toThrow(RangeError);
  });
});

describe('SALE_TYPE_WEIGHT', () => {
  it('weights auctions and accepted best offers fully', () => {
    expect(SALE_TYPE_WEIGHT.auction).toBe(1);
    expect(SALE_TYPE_WEIGHT.best_offer_accepted).toBe(1);
  });

  it('weights BIN lower than auctions', () => {
    expect(SALE_TYPE_WEIGHT.bin).toBeLessThan(SALE_TYPE_WEIGHT.auction);
    expect(SALE_TYPE_WEIGHT.bin).toBe(0.7);
  });

  it('weights active listings at zero (listings != sales)', () => {
    expect(SALE_TYPE_WEIGHT.active_listing).toBe(0);
  });

  it('weights unknown at 0.5 (fail-safe)', () => {
    expect(SALE_TYPE_WEIGHT.unknown).toBe(0.5);
  });
});

describe('applyWeights', () => {
  it('attaches recency, sale-type, and combined weights', () => {
    const c = comp(0, 50_000, RECENCY_HALF_LIFE_DAYS, 'bin');
    const [w] = applyWeights([c], NOW);
    expect(w!.recencyWeight).toBeCloseTo(0.5, 6);
    expect(w!.saleTypeWeight).toBe(0.7);
    expect(w!.weight).toBeCloseTo(0.35, 6);
  });

  it('preserves input order', () => {
    const a = comp(0, 100, 0, 'auction');
    const b = comp(1, 200, 30, 'bin');
    const result = applyWeights([a, b], NOW);
    expect(result.map((r) => r.id)).toEqual(['comp-0', 'comp-1']);
  });
});

describe('weightedMeanCents', () => {
  it('returns the weighted mean for a normal basket', () => {
    const comps = [comp(0, 100, 0, 'auction'), comp(1, 300, 0, 'auction')];
    const weighted = applyWeights(comps, NOW);
    // Both at weight 1.0 → simple mean = 200.
    expect(weightedMeanCents(weighted)).toBe(200);
  });

  it('returns null on empty input', () => {
    expect(weightedMeanCents([])).toBeNull();
  });

  it('returns null when all weights are zero', () => {
    const comps = [
      comp(0, 100, 0, 'active_listing'),
      comp(1, 200, 0, 'active_listing'),
    ];
    const weighted = applyWeights(comps, NOW);
    expect(weightedMeanCents(weighted)).toBeNull();
  });

  it('shifts toward heavier comps', () => {
    // Older BIN at $100, fresh auction at $300. The fresh auction
    // should dominate the weighted mean.
    const oldBin = comp(0, 10_000, 60, 'bin'); // 60d back, weight ~ 0.25 * 0.7 = 0.175
    const freshAuction = comp(1, 30_000, 0, 'auction'); // weight 1.0
    const weighted = applyWeights([oldBin, freshAuction], NOW);
    const mean = weightedMeanCents(weighted)!;
    expect(mean).toBeGreaterThan(20_000);
    expect(mean).toBeLessThan(30_000);
  });
});
