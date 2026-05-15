/**
 * Behavior-preservation test for the Layer 1 valuation engine.
 *
 * Purpose: lock down `valueCardWithProvider({ card, provider:
 * ebaySoldValuationProvider })` against canned eBay sold-search HTML so
 * that future edits to the engine, the provider, or the HTML parser
 * cannot silently change Layer 1's output shape. The Layer 2 wrapper
 * `fetchSoldRowsRaw` shares the same parser; this test guarantees the
 * additive export did not perturb the existing aggregation path.
 *
 * Test fixture is a 5-listing eBay sold-search page for a known card.
 * Expected `ValuationEstimate` is computed by hand from the parser +
 * scoring + percentile logic in `ebaySoldProvider.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { valueCardWithProvider } from '@/lib/valuation/engine';
import { ebaySoldValuationProvider } from '@/lib/valuation/providers/ebaySoldProvider';
import type { CardIdentity } from '@/lib/valuation/types';

const card: CardIdentity = {
  id: '00000000-0000-0000-0000-000000000000',
  title_raw: null,
  player_name: 'Luka Doncic',
  sport: 'basketball',
  team: 'Dallas Mavericks',
  year: 2018,
  brand: 'Panini',
  set_name: 'Prizm',
  subset: null,
  card_number: '280',
  parallel: 'Silver',
  serial_number: null,
  print_run: null,
  rookie: true,
  auto: false,
  patch: false,
  graded: true,
  grading_company: 'PSA',
  grade: '10',
};

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

const CANNED_HTML = `<!doctype html>
<html><body>
  <ul class="srp-results">
    ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,250.00', 'Sold Jan 12, 2026')}
    ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,300.00', 'Sold Jan 18, 2026')}
    ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,200.00', 'Sold Jan 25, 2026')}
    ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,400.00', 'Sold Feb 02, 2026')}
    ${listingHtml('2018 Panini Prizm Luka Doncic #280 Silver PSA 10', '$1,275.00', 'Sold Feb 10, 2026')}
  </ul>
</body></html>`;

describe('valueCardWithProvider (ebaySoldValuationProvider) — behavior preservation', () => {
  const fetchCalls: string[] = [];

  beforeEach(() => {
    fetchCalls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        fetchCalls.push(url);
        return new Response(CANNED_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('produces a deterministic ValuationEstimate for the canned HTML', async () => {
    const out = await valueCardWithProvider({
      card,
      provider: ebaySoldValuationProvider,
    });

    // Provenance + status: locked.
    expect(out.provider).toBe('ebay_sold_public');
    expect(out.status).toBe('ok');

    // Quantiles over [120_000, 125_000, 127_500, 130_000, 140_000]:
    //   p25 = 125_000, median = 127_500, p75 = 130_000
    expect(out.low_cents).toBe(125_000);
    expect(out.mid_cents).toBe(127_500);
    expect(out.high_cents).toBe(130_000);

    // Most-recent comp = first listing in HTML (lowest listIndex).
    expect(out.last_comp_price_cents).toBe(125_000);
    expect(out.last_comp_date).toBe('2026-01-12');
    expect(out.comp_count).toBe(5);

    // Each listing scores 100/100 (player_last + year + brand + set + card# +
    // parallel + grader + grade hits). Confidence floor:
    //   c = (0.22 + min(0.12, 2*0.025)) * 1.0 = 0.27
    expect(out.confidence).toBeCloseTo(0.27, 5);

    // Match notes should mention the query and average score.
    expect(out.match_notes).toMatch(/eBay sold comps/);
    expect(out.match_notes).toMatch(/Avg relevance 100/);
  });

  it('hits eBay sold search at the expected URL with category/sort params', async () => {
    await valueCardWithProvider({ card, provider: ebaySoldValuationProvider });
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const url = new URL(fetchCalls[0]!);
    expect(url.host).toBe('www.ebay.com');
    expect(url.pathname).toBe('/sch/i.html');
    expect(url.searchParams.get('LH_Sold')).toBe('1');
    expect(url.searchParams.get('LH_Complete')).toBe('1');
    expect(url.searchParams.get('_sop')).toBe('13');
    expect(url.searchParams.get('_nkw')).toContain('Luka Doncic');
  });

  it('clamps negative or non-finite cents from the provider to safe values', async () => {
    // Replace the provider with a stub that returns junk to confirm the
    // engine still sanitizes. This is a separate Layer 1 invariant the
    // engine must preserve.
    const junkProvider = {
      id: 'junk-test-only',
      async valueCard() {
        return {
          provider: 'junk-test-only',
          status: 'ok' as const,
          confidence: 0.5,
          match_notes: 'fixture',
          low_cents: -50,
          mid_cents: Number.NaN,
          high_cents: 100_00,
          last_comp_price_cents: -1,
          last_comp_date: '2026-05-01',
          comp_count: -3,
        };
      },
    };
    const out = await valueCardWithProvider({ card, provider: junkProvider });
    expect(out.low_cents).toBe(0);
    expect(out.mid_cents).toBeNull();
    expect(out.high_cents).toBe(100_00);
    expect(out.last_comp_price_cents).toBe(0);
    expect(out.comp_count).toBe(0);
  });
});

describe('fetchSoldRowsRaw — additive export', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(CANNED_HTML, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed individual rows without aggregation', async () => {
    const { fetchSoldRowsRaw } = await import('@/lib/valuation/providers/ebaySoldProvider');
    const rows = await fetchSoldRowsRaw('2018 Panini Prizm Luka Doncic 280 Silver PSA 10');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.priceCents)).toEqual([
      125_000, 130_000, 120_000, 140_000, 127_500,
    ]);
    expect(rows[0]!.title).toContain('Luka Doncic');
    expect(rows[0]!.soldCaption).toContain('Sold Jan 12, 2026');
    // listIndex preserves HTML order; 0 = first/most-recent.
    expect(rows.map((r) => r.listIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});
