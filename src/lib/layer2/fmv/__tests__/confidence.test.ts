import { describe, expect, it } from 'vitest';

import { bootstrapCi, mulberry32 } from '@/lib/layer2/fmv/confidence';
import { applyWeights } from '@/lib/layer2/fmv/weighting';
import type { Comp, SaleType } from '@/lib/layer2/types';

const NOW = Date.UTC(2026, 4, 13);

function comp(idx: number, salePriceCents: number, saleType: SaleType = 'auction'): Comp {
  return {
    id: `comp-${idx}`,
    canonicalCardId: 'test-card',
    source: 'ebay_marketplace_insights',
    sourceListingId: `listing-${idx}`,
    grader: 'PSA',
    grade: '10',
    salePriceCents,
    saleDate: '2026-05-13',
    saleType,
    listingUrl: null,
    fetchedAt: new Date(NOW).toISOString(),
  };
}

describe('mulberry32', () => {
  it('produces a deterministic sequence for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('bootstrapCi', () => {
  it('is deterministic given a seeded RNG', () => {
    const comps = [comp(0, 100), comp(1, 200), comp(2, 300), comp(3, 400), comp(4, 500)];
    const weighted = applyWeights(comps, NOW);
    const a = bootstrapCi(weighted, { rng: mulberry32(1), iterations: 1000 });
    const b = bootstrapCi(weighted, { rng: mulberry32(1), iterations: 1000 });
    expect(a).toEqual(b);
  });

  it('brackets the true mean for a uniform-weight basket', () => {
    const comps = [comp(0, 100), comp(1, 200), comp(2, 300), comp(3, 400), comp(4, 500)];
    const weighted = applyWeights(comps, NOW);
    const { ciLowCents, ciHighCents } = bootstrapCi(weighted, {
      rng: mulberry32(7),
      iterations: 1000,
    });
    // True (simple) mean is 300. CI should bracket it with margin.
    expect(ciLowCents).toBeLessThanOrEqual(300);
    expect(ciHighCents).toBeGreaterThanOrEqual(300);
    expect(ciLowCents).toBeLessThan(ciHighCents);
  });

  it('collapses to a point when all prices are identical', () => {
    const comps = [comp(0, 500_00), comp(1, 500_00), comp(2, 500_00), comp(3, 500_00)];
    const weighted = applyWeights(comps, NOW);
    const { ciLowCents, ciHighCents } = bootstrapCi(weighted, {
      rng: mulberry32(99),
      iterations: 200,
    });
    expect(ciLowCents).toBe(500_00);
    expect(ciHighCents).toBe(500_00);
  });

  it('widens the CI as price variance grows', () => {
    const tight = [100, 110, 120, 130, 140].map((p, i) => comp(i, p));
    const wide = [50, 100, 150, 200, 250].map((p, i) => comp(i, p));
    const weightedTight = applyWeights(tight, NOW);
    const weightedWide = applyWeights(wide, NOW);
    const tightCi = bootstrapCi(weightedTight, { rng: mulberry32(11), iterations: 1000 });
    const wideCi = bootstrapCi(weightedWide, { rng: mulberry32(11), iterations: 1000 });
    const tightWidth = tightCi.ciHighCents - tightCi.ciLowCents;
    const wideWidth = wideCi.ciHighCents - wideCi.ciLowCents;
    expect(wideWidth).toBeGreaterThan(tightWidth);
  });

  it('rejects empty input', () => {
    expect(() => bootstrapCi([], { rng: mulberry32(1) })).toThrow(RangeError);
  });

  it('rejects iteration counts < 1', () => {
    const weighted = applyWeights([comp(0, 100)], NOW);
    expect(() => bootstrapCi(weighted, { iterations: 0, rng: mulberry32(1) })).toThrow(
      RangeError,
    );
  });

  it('uses defaults for iterations and rng when opts are not provided', () => {
    // Smoke test: exercises the `?? DEFAULT_BOOTSTRAP_ITERATIONS` and
    // `?? Math.random` branches. We can't assert exact CI bounds with
    // an unseeded RNG, but the result must be a well-formed CI on a
    // tight basket.
    const comps = [comp(0, 100), comp(1, 100), comp(2, 100), comp(3, 100), comp(4, 100)];
    const weighted = applyWeights(comps, NOW);
    const result = bootstrapCi(weighted);
    expect(result.iterations).toBe(1000);
    expect(result.ciLowCents).toBe(100);
    expect(result.ciHighCents).toBe(100);
  });

  it('returns a CI of 0 cents when every drawn comp has zero weight (totalWeight=0 path)', () => {
    // Construct weighted comps with weight === 0 explicitly. This
    // bypasses applyWeights so we can hit the defensive
    // `totalWeight > 0 ? ... : 0` ternary inside the bootstrap loop
    // without going through computeFmv (which has its own zero-weight
    // gate upstream).
    const zeroWeighted = [
      { ...comp(0, 100_00), recencyWeight: 0, saleTypeWeight: 0, weight: 0 },
      { ...comp(1, 200_00), recencyWeight: 0, saleTypeWeight: 0, weight: 0 },
      { ...comp(2, 300_00), recencyWeight: 0, saleTypeWeight: 0, weight: 0 },
    ];
    const result = bootstrapCi(zeroWeighted, { rng: mulberry32(1), iterations: 50 });
    expect(result.ciLowCents).toBe(0);
    expect(result.ciHighCents).toBe(0);
  });
});
