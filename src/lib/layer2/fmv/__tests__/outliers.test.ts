import { describe, expect, it } from 'vitest';

import { iqrFences, quantile, splitByOutliers } from '@/lib/layer2/fmv/outliers';
import type { Comp } from '@/lib/layer2/types';

function comp(idx: number, salePriceCents: number): Comp {
  return {
    id: `comp-${idx}`,
    canonicalCardId: 'test-card',
    source: 'ebay_marketplace_insights',
    sourceListingId: `listing-${idx}`,
    grader: 'PSA',
    grade: '10',
    salePriceCents,
    saleDate: '2026-05-01',
    saleType: 'auction',
    listingUrl: null,
    fetchedAt: '2026-05-01T00:00:00Z',
  };
}

describe('quantile', () => {
  it('returns null on empty input', () => {
    expect(quantile([], 0.5)).toBeNull();
  });

  it('returns the only value for a singleton', () => {
    expect(quantile([42], 0.5)).toBe(42);
  });

  it('matches known type-7 quantiles for [1..9]', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(quantile(xs, 0.25)).toBe(3);
    expect(quantile(xs, 0.5)).toBe(5);
    expect(quantile(xs, 0.75)).toBe(7);
  });

  it('linearly interpolates between elements', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });

  it('rejects p outside [0,1]', () => {
    expect(() => quantile([1, 2, 3], 1.1)).toThrow(RangeError);
    expect(() => quantile([1, 2, 3], -0.01)).toThrow(RangeError);
  });
});

describe('iqrFences', () => {
  it('computes fences for a uniform basket', () => {
    const f = iqrFences([100, 200, 300, 400, 500]);
    expect(f.q1).toBe(200);
    expect(f.q3).toBe(400);
    expect(f.iqr).toBe(200);
    expect(f.lowerFence).toBe(-100);
    expect(f.upperFence).toBe(700);
  });

  it('collapses to a point when all prices are identical', () => {
    const f = iqrFences([500, 500, 500, 500]);
    expect(f.iqr).toBe(0);
    expect(f.lowerFence).toBe(500);
    expect(f.upperFence).toBe(500);
  });

  it('throws on empty input', () => {
    expect(() => iqrFences([])).toThrow(RangeError);
  });
});

describe('splitByOutliers', () => {
  it('flags an obvious high outlier', () => {
    // 10 sales at $500, 1 sale at $50,000 (the spec test fixture).
    const comps: Comp[] = [];
    for (let i = 0; i < 10; i++) comps.push(comp(i, 50_000));
    comps.push(comp(10, 5_000_000));

    const { included, excluded } = splitByOutliers(comps);
    expect(included).toHaveLength(10);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]!.salePriceCents).toBe(5_000_000);
  });

  it('flags an obvious low outlier', () => {
    const comps: Comp[] = [];
    for (let i = 0; i < 10; i++) comps.push(comp(i, 50_000));
    comps.push(comp(10, 100)); // $1, clearly junk

    const { included, excluded } = splitByOutliers(comps);
    expect(excluded.map((c) => c.salePriceCents)).toEqual([100]);
    expect(included).toHaveLength(10);
  });

  it('excludes nothing when IQR is zero', () => {
    const comps = [comp(0, 500), comp(1, 500), comp(2, 500)];
    const { included, excluded } = splitByOutliers(comps);
    expect(included).toHaveLength(3);
    expect(excluded).toHaveLength(0);
  });

  it('keeps mild variation untouched', () => {
    // Prices within natural market spread should all stay in.
    const comps = [400, 450, 475, 500, 525, 550, 600].map((p, i) => comp(i, p * 100));
    const { included, excluded } = splitByOutliers(comps);
    expect(excluded).toHaveLength(0);
    expect(included).toHaveLength(7);
  });

  it('preserves order within included and excluded', () => {
    const comps = [comp(0, 500), comp(1, 10_000_000), comp(2, 550), comp(3, 525)];
    const { included, excluded } = splitByOutliers(comps);
    expect(included.map((c) => c.id)).toEqual(['comp-0', 'comp-2', 'comp-3']);
    expect(excluded.map((c) => c.id)).toEqual(['comp-1']);
  });

  it('throws on empty input', () => {
    expect(() => splitByOutliers([])).toThrow(RangeError);
  });
});
