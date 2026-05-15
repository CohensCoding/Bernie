/**
 * Tests for the Layer 2 eBay HTML-scrape adapter.
 *
 * What we lock down here:
 *  1. Scraped rows are tagged `source: 'ebay_scrape'`.
 *  2. The sold-date caption is parsed into ISO format.
 *  3. Rows older than the lookback window are dropped.
 *  4. A Cloudflare interstitial / fetch failure degrades gracefully
 *     (`{ ok: false }`) rather than throwing.
 *
 * What's exercised elsewhere:
 *  - The `compute.test.ts` suite confirms that comps with
 *    `source: 'ebay_scrape'` are excluded from FMV math.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildScrapeQuery,
  ebayScrapeSource,
  parseSoldDateCaption,
} from '@/lib/layer2/sources/ebayScrape';
import { isFmvEligibleSource } from '@/lib/layer2/types';
import type { CompQuery } from '@/lib/layer2/sources/types';

function listingHtml(title: string, price: string, soldCaption: string): string {
  return `
<li class="s-item">
  <div class="s-item__title">
    <span role="heading" aria-level="3">${title}</span>
  </div>
  <span class="s-item__price">${price}</span>
  <span class="s-item__caption">${soldCaption}</span>
</li>`.trim();
}

const QUERY: CompQuery = {
  canonicalId: 'panini-prizm-2018-280-luka-doncic-silver',
  player: 'Luka Doncic',
  year: 2018,
  setName: 'Panini Prizm',
  cardNumber: '280',
  parallel: 'Silver',
  grader: 'PSA',
  grade: '10',
  daysBack: 90,
};

const NOW = new Date('2026-05-13T12:00:00Z');

describe('parseSoldDateCaption', () => {
  it('parses standard eBay "Sold MMM D, YYYY" captions', () => {
    expect(parseSoldDateCaption('Sold Jan 12, 2026')).toBe('2026-01-12');
    expect(parseSoldDateCaption('Sold Mar 5, 2025')).toBe('2025-03-05');
    expect(parseSoldDateCaption('Sold Dec 31, 2024')).toBe('2024-12-31');
  });

  it('is case-insensitive on month name', () => {
    expect(parseSoldDateCaption('sold jan 12, 2026')).toBe('2026-01-12');
    expect(parseSoldDateCaption('SOLD FEB 28, 2026')).toBe('2026-02-28');
  });

  it('returns null on unparseable captions', () => {
    expect(parseSoldDateCaption(null)).toBeNull();
    expect(parseSoldDateCaption('')).toBeNull();
    expect(parseSoldDateCaption('Sold yesterday')).toBeNull();
    expect(parseSoldDateCaption('Sold 12 Jan 2026')).toBeNull();
  });
});

describe('buildScrapeQuery', () => {
  it('emits a keyword query suitable for eBay sold search', () => {
    expect(buildScrapeQuery(QUERY)).toBe(
      '2018 Panini Prizm Luka Doncic 280 Silver PSA 10',
    );
  });

  it('omits grader/grade for raw cards', () => {
    expect(buildScrapeQuery({ ...QUERY, grader: 'RAW', grade: 'RAW' })).toBe(
      '2018 Panini Prizm Luka Doncic 280 Silver',
    );
  });

  it('drops empty optional fields without leaving doubled spaces', () => {
    const q = buildScrapeQuery({ ...QUERY, cardNumber: undefined, parallel: undefined });
    expect(q).toBe('2018 Panini Prizm Luka Doncic PSA 10');
    expect(q).not.toMatch(/\s{2,}/);
  });
});

describe('ebayScrapeSource.fetchComps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns RawComps tagged with source = "ebay_scrape"', async () => {
    const html = `<html><body>
      ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,250.00', 'Sold Apr 12, 2026')}
      ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,300.00', 'Sold Apr 20, 2026')}
      ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,275.00', 'Sold May 01, 2026')}
    </body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 })),
    );

    const out = await ebayScrapeSource.fetchComps(QUERY);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.source).toBe('ebay_scrape');
    expect(out.comps).toHaveLength(3);
    expect(out.comps.every((c) => c.source === 'ebay_scrape')).toBe(true);
    expect(out.comps.every((c) => isFmvEligibleSource(c.source) === false)).toBe(true);
    expect(out.comps.map((c) => c.salePriceCents)).toEqual([125_000, 130_000, 127_500]);
    expect(out.comps.map((c) => c.saleDate)).toEqual([
      '2026-04-12',
      '2026-04-20',
      '2026-05-01',
    ]);
    expect(out.comps.every((c) => c.saleType === 'unknown')).toBe(true);
    expect(out.comps.every((c) => c.sourceListingId === null)).toBe(true);
  });

  it('drops rows older than the lookback window', async () => {
    // daysBack=90 at NOW=2026-05-13 → floor is 2026-02-12.
    const html = `<html><body>
      ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,000.00', 'Sold Jan 02, 2026')}
      ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,300.00', 'Sold Apr 20, 2026')}
    </body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 })),
    );

    const out = await ebayScrapeSource.fetchComps(QUERY);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.comps).toHaveLength(1);
    expect(out.comps[0]!.saleDate).toBe('2026-04-20');
  });

  it('marks fallback dates in raw_payload when the caption is unparseable', async () => {
    const html = `<html><body>
      ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,250.00', 'Sold recently')}
    </body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 })),
    );

    const out = await ebayScrapeSource.fetchComps(QUERY);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.comps).toHaveLength(1);
    expect(out.comps[0]!.saleDate).toBe(NOW.toISOString().slice(0, 10));
    const payload = out.comps[0]!.rawPayload as { dateIsFallback: boolean };
    expect(payload.dateIsFallback).toBe(true);
  });

  it('degrades to { ok: false } when eBay blocks public access (Cloudflare)', async () => {
    const interstitial = `<html><head><title>Pardon Our Interruption</title></head><body>...</body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(interstitial, { status: 200 })),
    );

    const out = await ebayScrapeSource.fetchComps(QUERY);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('unreachable');
    expect(out.source).toBe('ebay_scrape');
    expect(out.reason).toMatch(/blocked|scrape failed/i);
  });

  it('degrades to { ok: false } when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection reset');
      }),
    );

    const out = await ebayScrapeSource.fetchComps(QUERY);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('unreachable');
    expect(out.reason).toMatch(/connection reset|scrape failed/);
  });

  it('rejects too-short keyword queries up front', async () => {
    const out = await ebayScrapeSource.fetchComps({
      ...QUERY,
      player: '',
      setName: '',
      cardNumber: undefined,
      parallel: undefined,
      grader: 'RAW',
      grade: 'RAW',
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('unreachable');
    expect(out.reason).toMatch(/too short/);
  });
});
