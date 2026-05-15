/**
 * eBay HTML-scrape comp source — display-only backstop.
 *
 * Wraps the Layer 1 HTML parser via the single additive export
 * `fetchSoldRowsRaw` from `src/lib/valuation/providers/ebaySoldProvider.ts`
 * (see `docs/LAYER_2_DECISIONS.md` D8). Returned rows are tagged
 * `source: 'ebay_scrape'` and are deliberately NOT FMV-eligible — see
 * `FMV_ELIGIBLE_SOURCES` in `src/lib/layer2/types.ts`. They surface in
 * the Phase 2 result UI's "Reference sales (unverified)" section so the
 * user can sanity-check what the official-API sources are telling them.
 *
 * Reliability:
 *  - The underlying scraper has its own fetch path and can fail with
 *    Cloudflare interstitials; we catch and return `{ ok: false }` so
 *    the orchestrator can degrade gracefully (rule 8).
 *  - Sale type is reported as `'unknown'` because eBay search HTML
 *    does not reliably distinguish auction-clear from BIN-clear from
 *    BO-accepted. The unknown sale-type weight (0.5) is irrelevant
 *    here anyway since these rows never enter the FMV calculation.
 */

import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';
import type { RawComp } from '@/lib/layer2/types';
import { fetchSoldRowsRaw } from '@/lib/valuation/providers/ebaySoldProvider';

/**
 * Build a keyword query for eBay sold-search. Mirrors the shape used by
 * the Layer 1 provider's `buildExactQuery`, but driven by the Layer 2
 * `CompQuery` field names. Empty / whitespace-only fields are dropped.
 */
export function buildScrapeQuery(q: CompQuery): string {
  const parts: string[] = [];
  parts.push(String(q.year));
  if (q.setName) parts.push(q.setName);
  parts.push(q.player);
  if (q.cardNumber) parts.push(q.cardNumber);
  if (q.parallel) parts.push(q.parallel);
  if (q.grader !== 'RAW') {
    parts.push(q.grader, q.grade);
  }
  return parts
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ');
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Parse the "Sold MMM D, YYYY" caption eBay shows under each sold price.
 *
 * Mirrors the Layer 1 `parseSoldDateHint` regex without duplicating
 * code-by-import: we accept a Phase-1-acceptable level of duplication
 * (10 lines, well-bounded format) to honor decision D8's "single new
 * export" rule. Returns `null` when no date is detectable.
 */
export function parseSoldDateCaption(caption: string | null): string | null {
  if (!caption) return null;
  const m = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(\d{4})/i.exec(
    caption,
  );
  if (!m) return null;
  const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
  if (!mo) return null;
  const day = String(Number(m[2])).padStart(2, '0');
  return `${m[3]!}-${mo}-${day}`;
}

export const ebayScrapeSource: CompSource = {
  id: 'ebay_scrape',

  /**
   * Always reports available; the scraper has no env / token gating.
   * Runtime failures (Cloudflare, network) surface through fetchComps
   * as `{ ok: false }`, not by hiding the source.
   */
  isAvailable(): boolean {
    return true;
  },

  async fetchComps(query: CompQuery): Promise<CompFetchResult> {
    const keyword = buildScrapeQuery(query);
    if (keyword.length < 6) {
      return {
        ok: false,
        source: 'ebay_scrape',
        reason: 'Scrape keyword too short to be meaningful',
      };
    }

    let rows: Awaited<ReturnType<typeof fetchSoldRowsRaw>>;
    try {
      rows = await fetchSoldRowsRaw(keyword);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      return { ok: false, source: 'ebay_scrape', reason: `scrape failed: ${msg}` };
    }

    // Date floor: drop rows whose sold date is older than the requested
    // lookback window. Rows with an unparseable caption keep today's
    // date as a best-effort fallback so they still show up in the
    // reference UI; honesty about that fallback lives in `raw_payload`.
    const today = new Date().toISOString().slice(0, 10);
    const lookbackDays = query.daysBack ?? 90;
    const floorMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    const comps: RawComp[] = [];
    for (const r of rows) {
      const parsedDate = parseSoldDateCaption(r.soldCaption);
      const isFallback = parsedDate == null;
      const saleDate = parsedDate ?? today;

      if (parsedDate != null && Date.parse(parsedDate) < floorMs) {
        continue;
      }

      comps.push({
        source: 'ebay_scrape',
        sourceListingId: null,
        grader: query.grader,
        grade: query.grade,
        salePriceCents: r.priceCents,
        saleDate,
        saleType: 'unknown',
        listingUrl: null,
        rawPayload: {
          title: r.title,
          soldCaption: r.soldCaption,
          listIndex: r.listIndex,
          dateIsFallback: isFallback,
        },
      });
    }

    return { ok: true, source: 'ebay_scrape', comps };
  },
};
