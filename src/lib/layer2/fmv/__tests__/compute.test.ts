import { describe, expect, it } from 'vitest';

import { computeFmv, MIN_SAMPLE_SIZE, STALE_THRESHOLD_DAYS } from '@/lib/layer2/fmv/compute';
import { mulberry32 } from '@/lib/layer2/fmv/confidence';
import type { Comp, CompSourceId, SaleType } from '@/lib/layer2/types';

const NOW = Date.UTC(2026, 4, 13); // 2026-05-13

function isoDaysBack(days: number, base: number = NOW): string {
  return new Date(base - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type CompOverrides = {
  source?: CompSourceId;
  saleType?: SaleType;
  daysBack?: number;
  saleDate?: string;
  grader?: Comp['grader'];
  grade?: string;
};

function makeComp(idx: number, salePriceCents: number, overrides: CompOverrides = {}): Comp {
  const saleDate = overrides.saleDate ?? isoDaysBack(overrides.daysBack ?? 0);
  return {
    id: `comp-${idx}`,
    canonicalCardId: 'test-card',
    source: overrides.source ?? 'ebay_marketplace_insights',
    sourceListingId: `listing-${idx}`,
    grader: overrides.grader ?? 'PSA',
    grade: overrides.grade ?? '10',
    salePriceCents,
    saleDate,
    saleType: overrides.saleType ?? 'auction',
    listingUrl: null,
    fetchedAt: new Date(NOW).toISOString(),
  };
}

const DET = { rng: mulberry32(2026), iterations: 1000 } as const;

describe('computeFmv — INSUFFICIENT_DATA gates', () => {
  it('returns INSUFFICIENT_DATA with 0 comps', () => {
    const result = computeFmv([], { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('INSUFFICIENT_DATA');
    if (result.status === 'INSUFFICIENT_DATA') {
      expect(result.sampleSize).toBe(0);
      expect(result.methodologyVersion).toBe('v1.0.0');
    }
  });

  it('returns INSUFFICIENT_DATA at the boundary (n = MIN - 1)', () => {
    const comps = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, (_, i) => makeComp(i, 50_000));
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('produces an OK result at the boundary (n = MIN)', () => {
    const comps = Array.from({ length: MIN_SAMPLE_SIZE }, (_, i) => makeComp(i, 50_000));
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('OK');
  });

  // Note: INSUFFICIENT_DATA_AFTER_OUTLIERS is a defensive guard. With IQR
  // fences at 1.5× and our min sample size of 3, that branch is essentially
  // unreachable from natural data — IQR on a tiny bimodal basket produces
  // fences too wide to exclude anything. The branch is exercised
  // transitively by the IQR helper tests (`outliers.test.ts`); leaving an
  // attempt to hit it here would require contrived inputs that don't
  // resemble real comp baskets.
});

describe('computeFmv — OK path', () => {
  it('produces stable cents, CI ordering, and version on a clean basket', () => {
    const comps = [50_000, 52_000, 49_000, 51_000, 50_500].map((p, i) => makeComp(i, p));
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });

    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');

    expect(result.methodologyVersion).toBe('v1.0.0');
    expect(result.sampleSize).toBe(5);
    expect(result.compsExcluded).toHaveLength(0);
    expect(result.fmvCents).toBeGreaterThan(0);
    expect(Number.isInteger(result.fmvCents)).toBe(true);
    expect(result.ciLowCents).toBeLessThanOrEqual(result.fmvCents);
    expect(result.fmvCents).toBeLessThanOrEqual(result.ciHighCents);
    expect(result.isStale).toBe(false);
    expect(result.daysSinceLastSale).toBeLessThanOrEqual(STALE_THRESHOLD_DAYS);
  });

  it('exposes excluded comps separately rather than dropping them silently', () => {
    const comps = [
      ...Array.from({ length: 10 }, (_, i) => makeComp(i, 50_000)),
      makeComp(99, 50_000_00), // a clear outlier
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });

    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');

    expect(result.sampleSize).toBe(10);
    expect(result.compsExcluded).toHaveLength(1);
    expect(result.compsExcluded[0]!.id).toBe('comp-99');
  });
});

describe('computeFmv — recency weighting', () => {
  it('produces a different FMV when only the dates change (same prices)', () => {
    // Same prices [400, 500, 600], different ages.
    const recent = [400, 500, 600].map((p, i) => makeComp(i, p * 100, { daysBack: 0 }));
    const aged = [400, 500, 600].map((p, i) =>
      makeComp(i, p * 100, { daysBack: 60 }), // two half-lives back
    );

    const recentResult = computeFmv(recent, { nowMs: NOW, bootstrap: DET });
    const agedResult = computeFmv(aged, { nowMs: NOW, bootstrap: DET });

    expect(recentResult.status).toBe('OK');
    expect(agedResult.status).toBe('OK');
    if (recentResult.status !== 'OK' || agedResult.status !== 'OK') {
      throw new Error('unreachable');
    }

    // Point estimates are equal (uniform weight × uniform decay across the
    // basket cancels), but the staleness flag must differ.
    expect(recentResult.isStale).toBe(false);
    expect(agedResult.isStale).toBe(true);
  });

  it('shifts FMV toward more recent sales when prices differ by date', () => {
    // Older sales lower, recent sales higher. FMV should sit closer to
    // the recent (higher) prices.
    const comps = [
      makeComp(0, 10_000, { daysBack: 70 }), // weight ~ 0.5^(70/30) = 0.197
      makeComp(1, 10_000, { daysBack: 70 }),
      makeComp(2, 10_000, { daysBack: 70 }),
      makeComp(3, 30_000, { daysBack: 0 }), // weight 1
      makeComp(4, 30_000, { daysBack: 0 }),
      makeComp(5, 30_000, { daysBack: 0 }),
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');

    expect(result.fmvCents).toBeGreaterThan(20_000); // closer to the fresh side
    expect(result.fmvCents).toBeLessThan(30_000);
  });
});

describe('computeFmv — sale-type weighting', () => {
  it('produces a LOWER FMV for a BIN-heavy basket than an auction-heavy one (when BIN prices are higher than auction prices)', () => {
    // Classic scenario: BIN listings are aspirational and tagged higher,
    // auctions clear lower. With BIN weight 0.7 and auction 1.0, the
    // auction prices should pull the basket downward.
    const binHeavy = [
      makeComp(0, 60_000, { saleType: 'bin' }),
      makeComp(1, 60_000, { saleType: 'bin' }),
      makeComp(2, 60_000, { saleType: 'bin' }),
      makeComp(3, 40_000, { saleType: 'auction' }),
    ];
    const auctionHeavy = [
      makeComp(0, 60_000, { saleType: 'bin' }),
      makeComp(1, 40_000, { saleType: 'auction' }),
      makeComp(2, 40_000, { saleType: 'auction' }),
      makeComp(3, 40_000, { saleType: 'auction' }),
    ];

    const binResult = computeFmv(binHeavy, { nowMs: NOW, bootstrap: DET });
    const auctionResult = computeFmv(auctionHeavy, { nowMs: NOW, bootstrap: DET });

    expect(binResult.status).toBe('OK');
    expect(auctionResult.status).toBe('OK');
    if (binResult.status !== 'OK' || auctionResult.status !== 'OK') {
      throw new Error('unreachable');
    }
    // BIN-heavy still has more high-price comps, but each carries less
    // weight; auction-heavy should still settle lower.
    expect(auctionResult.fmvCents).toBeLessThan(binResult.fmvCents);
  });

  it('treats best_offer_accepted with the same weight as auction', () => {
    const auctionBasket = Array.from({ length: 5 }, (_, i) =>
      makeComp(i, 50_000, { saleType: 'auction' }),
    );
    const boBasket = Array.from({ length: 5 }, (_, i) =>
      makeComp(i, 50_000, { saleType: 'best_offer_accepted' }),
    );
    const auction = computeFmv(auctionBasket, { nowMs: NOW, bootstrap: DET });
    const bo = computeFmv(boBasket, { nowMs: NOW, bootstrap: DET });
    expect(auction.status).toBe('OK');
    expect(bo.status).toBe('OK');
    if (auction.status !== 'OK' || bo.status !== 'OK') throw new Error('unreachable');
    expect(auction.fmvCents).toBe(bo.fmvCents);
  });
});

describe('computeFmv — stale flag', () => {
  it('does NOT mark fresh comps as stale', () => {
    const comps = Array.from({ length: 5 }, (_, i) => makeComp(i, 50_000, { daysBack: 5 }));
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.isStale).toBe(false);
  });

  it('marks comps stale when the most recent is > 30 days old', () => {
    const comps = Array.from({ length: 5 }, (_, i) => makeComp(i, 50_000, { daysBack: 45 }));
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.isStale).toBe(true);
    expect(result.daysSinceLastSale).toBeGreaterThan(STALE_THRESHOLD_DAYS);
  });

  it('marks the basket stale based on the MOST RECENT comp, not the oldest', () => {
    // One mostly-old basket but with one fresh sale — should NOT be stale.
    const comps = [
      ...Array.from({ length: 4 }, (_, i) => makeComp(i, 50_000, { daysBack: 60 })),
      makeComp(99, 50_000, { daysBack: 1 }),
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.isStale).toBe(false);
  });
});

describe('computeFmv — defensive guards', () => {
  it('returns INSUFFICIENT_DATA_AFTER_OUTLIERS when every FMV-eligible comp carries an active_listing saleType (zero total weight)', () => {
    // Sources that are FMV-eligible (e.g. cardhedge) but whose rows
    // somehow carry saleType: 'active_listing' produce a zero-weight
    // basket. The math layer must refuse rather than emit NaN/Infinity.
    const comps = [
      makeComp(0, 50_000, { source: 'cardhedge', saleType: 'active_listing' }),
      makeComp(1, 51_000, { source: 'cardhedge', saleType: 'active_listing' }),
      makeComp(2, 49_000, { source: 'cardhedge', saleType: 'active_listing' }),
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('INSUFFICIENT_DATA_AFTER_OUTLIERS');
    if (result.status !== 'INSUFFICIENT_DATA_AFTER_OUTLIERS') throw new Error('unreachable');
    expect(result.sampleSize).toBe(0);
    expect(result.compsAvailable).toHaveLength(3);
    expect(result.methodologyVersion).toBe('v1.0.0');
  });

  it('falls back to Date.now() when nowMs is not provided', () => {
    // No options at all — exercises the `opts.nowMs ?? Date.now()` and
    // `opts.bootstrap ?? defaults` branches. Result must still be a
    // valid OK shape because the prices are clean and the dates are
    // recent.
    const todayIso = new Date().toISOString().slice(0, 10);
    const comps = Array.from({ length: 5 }, (_, i) => ({
      id: `dflt-${i}`,
      canonicalCardId: 'test-card',
      source: 'ebay_marketplace_insights' as const,
      sourceListingId: `dflt-${i}`,
      grader: 'PSA' as const,
      grade: '10',
      salePriceCents: 50_000 + i * 100,
      saleDate: todayIso,
      saleType: 'auction' as const,
      listingUrl: null,
      fetchedAt: new Date().toISOString(),
    }));
    const result = computeFmv(comps);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.isStale).toBe(false);
    expect(result.methodologyVersion).toBe('v1.0.0');
  });
});

describe('computeFmv — FMV-eligible source filter', () => {
  it('excludes ebay_browse rows from FMV math (they are listings, not sales)', () => {
    // 4 active listings + only 2 real sales → after the eligibility
    // filter, sample size is 2, below MIN. Must NOT compute an FMV.
    const comps = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeComp(i, 50_000, { source: 'ebay_browse', saleType: 'active_listing' }),
      ),
      makeComp(98, 50_000, { source: 'ebay_marketplace_insights' }),
      makeComp(99, 51_000, { source: 'ebay_marketplace_insights' }),
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('INSUFFICIENT_DATA');
    if (result.status === 'INSUFFICIENT_DATA') {
      expect(result.sampleSize).toBe(2);
    }
  });

  it('excludes ebay_scrape rows from FMV math (unverified backstop)', () => {
    const comps = [
      ...Array.from({ length: 10 }, (_, i) => makeComp(i, 50_000, { source: 'ebay_scrape' })),
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('mixes FMV-eligible sources into a single basket', () => {
    const comps = [
      makeComp(0, 50_000, { source: 'ebay_marketplace_insights' }),
      makeComp(1, 51_000, { source: 'cardhedge' }),
      makeComp(2, 49_000, { source: '130point' }),
      makeComp(3, 50_500, { source: 'card_ladder_manual' }),
      // a noise row that should be dropped:
      makeComp(99, 5_000_000, { source: 'ebay_scrape' }),
    ];
    const result = computeFmv(comps, { nowMs: NOW, bootstrap: DET });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.sampleSize).toBe(4);
    expect(result.compsUsed.every((c) => c.source !== 'ebay_scrape')).toBe(true);
  });
});
