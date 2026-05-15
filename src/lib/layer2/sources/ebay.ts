/**
 * eBay comp source — official APIs.
 *
 * Strategy (per spec + decisions D4):
 *   1. If `EBAY_MARKETPLACE_INSIGHTS_ENABLED=true` and we have an OAuth
 *      token, hit Marketplace Insights for completed sales (FMV-eligible).
 *   2. On 401/403 (not approved / token bad), fall back to Browse for
 *      active listings tagged as `ACTIVE_LISTING` — DISPLAY only, never
 *      FMV-eligible.
 *   3. On other failures, return `{ ok: false, reason }`. The orchestrator
 *      keeps results from other sources (rule 8 — graceful degradation).
 *
 * Approval gating: Marketplace Insights is a vetted-only program. Bernie
 * starts with the flag off; the adapter must not crash when the token is
 * absent. Browse API uses the same OAuth token but is generally available.
 */

import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';
import type { CompSourceId, RawComp, SaleType } from '@/lib/layer2/types';
import { fetchWithRetry } from '@/lib/layer2/sources/http';
import {
  getEbayApplicationToken,
  hasAnyEbayCredentials,
} from '@/lib/layer2/sources/ebayAuth';

const MARKETPLACE_INSIGHTS_URL =
  'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search';
const BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

// eBay category for Sports Trading Cards. Stable for years.
const CATEGORY_SPORTS_CARDS = '64482'; // "Trading Card Singles"
const MARKETPLACE_ID = 'EBAY_US';

function envBool(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && /^(1|true|yes|on)$/i.test(v);
}

function buildKeywordQuery(q: CompQuery): string {
  const parts: string[] = [String(q.year), q.setName, q.player];
  if (q.cardNumber) parts.push(q.cardNumber);
  if (q.parallel) parts.push(q.parallel);
  if (q.grader !== 'RAW') {
    parts.push(q.grader, q.grade);
  }
  return parts.filter((s) => s && s.trim().length > 0).join(' ');
}

function parseSaleType(payload: {
  bidCount?: number;
  buyingOptions?: readonly string[];
  acceptedOffer?: boolean;
}): SaleType {
  if (payload.acceptedOffer) return 'best_offer_accepted';
  if ((payload.bidCount ?? 0) > 0) return 'auction';
  const opts = payload.buyingOptions ?? [];
  if (opts.includes('FIXED_PRICE')) return 'bin';
  if (opts.includes('AUCTION')) return 'auction';
  return 'unknown';
}

function dollarsToCents(value: string | number | undefined | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type EbayItemSale = {
  itemId?: string;
  legacyItemId?: string;
  itemWebUrl?: string;
  lastSoldPrice?: { value?: string; currency?: string };
  lastSoldDate?: string; // ISO datetime
  bidCount?: number;
  buyingOptions?: string[];
  acceptedOffer?: boolean;
};

type EbayBrowseItem = {
  itemId?: string;
  legacyItemId?: string;
  itemWebUrl?: string;
  price?: { value?: string; currency?: string };
  buyingOptions?: string[];
  bidCount?: number;
};

function isoDateOnly(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

async function fetchMarketplaceInsights(q: CompQuery, token: string): Promise<RawComp[]> {
  const url = new URL(MARKETPLACE_INSIGHTS_URL);
  url.searchParams.set('q', buildKeywordQuery(q));
  url.searchParams.set('filter', `categoryIds:{${CATEGORY_SPORTS_CARDS}}`);
  url.searchParams.set('limit', '50');

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
      Accept: 'application/json',
    },
  });

  if (res.status === 401 || res.status === 403) {
    // Vetted-only program; not approved for this app. Caller falls back.
    throw new MarketplaceInsightsNotApproved(`status ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`Marketplace Insights HTTP ${res.status}`);
  }

  const json = (await res.json()) as { itemSales?: EbayItemSale[] };
  const sales = json.itemSales ?? [];
  const comps: RawComp[] = [];
  for (const s of sales) {
    const cents = dollarsToCents(s.lastSoldPrice?.value);
    const date = isoDateOnly(s.lastSoldDate);
    if (cents == null || !date) continue;
    comps.push({
      source: 'ebay_marketplace_insights',
      sourceListingId: s.itemId ?? s.legacyItemId ?? null,
      grader: q.grader,
      grade: q.grade,
      salePriceCents: cents,
      saleDate: date,
      saleType: parseSaleType({
        bidCount: s.bidCount,
        buyingOptions: s.buyingOptions,
        acceptedOffer: s.acceptedOffer,
      }),
      listingUrl: s.itemWebUrl ?? null,
      rawPayload: s,
    });
  }
  return comps;
}

class MarketplaceInsightsNotApproved extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'MarketplaceInsightsNotApproved';
  }
}

async function fetchBrowseActive(q: CompQuery, token: string): Promise<RawComp[]> {
  const url = new URL(BROWSE_URL);
  url.searchParams.set('q', buildKeywordQuery(q));
  url.searchParams.set('category_ids', CATEGORY_SPORTS_CARDS);
  url.searchParams.set('limit', '50');

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Browse HTTP ${res.status}`);
  }

  const json = (await res.json()) as { itemSummaries?: EbayBrowseItem[] };
  const items = json.itemSummaries ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const comps: RawComp[] = [];
  for (const i of items) {
    const cents = dollarsToCents(i.price?.value);
    if (cents == null) continue;
    comps.push({
      source: 'ebay_browse',
      sourceListingId: i.itemId ?? i.legacyItemId ?? null,
      grader: q.grader,
      grade: q.grade,
      salePriceCents: cents,
      saleDate: today, // listings don't have a sale date; use snapshot date
      saleType: 'active_listing',
      listingUrl: i.itemWebUrl ?? null,
      rawPayload: i,
    });
  }
  return comps;
}

export const ebaySource: CompSource = {
  id: 'ebay_marketplace_insights',

  isAvailable(): boolean {
    return hasAnyEbayCredentials();
  },

  async fetchComps(query: CompQuery): Promise<CompFetchResult> {
    const auth = await getEbayApplicationToken();
    if (!auth.ok) {
      return {
        ok: false,
        source: 'ebay_marketplace_insights',
        reason: auth.reason,
      };
    }
    const token = auth.token;

    if (envBool('EBAY_MARKETPLACE_INSIGHTS_ENABLED')) {
      try {
        const comps = await fetchMarketplaceInsights(query, token);
        return { ok: true, source: 'ebay_marketplace_insights', comps };
      } catch (e) {
        if (e instanceof MarketplaceInsightsNotApproved) {
          console.warn(
            '[layer2/ebay] Marketplace Insights not approved for this app; falling back to Browse for active listings.',
          );
          // Fall through to Browse fallback.
        } else {
          const msg = e instanceof Error ? e.message : 'unknown';
          console.warn(`[layer2/ebay] Marketplace Insights failed: ${msg}`);
          // Still try Browse as a partial-data fallback.
        }
      }
    }

    try {
      const comps = await fetchBrowseActive(query, token);
      // Note the source on the result is `ebay_marketplace_insights`
      // (the adapter id) so callers can group, even though individual
      // comps are tagged `ebay_browse`.
      return { ok: true, source: 'ebay_marketplace_insights', comps };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      return {
        ok: false,
        source: 'ebay_marketplace_insights',
        reason: `eBay Browse failed: ${msg}`,
      };
    }
  },
};

export const __testing = {
  buildKeywordQuery,
  parseSaleType,
  dollarsToCents,
  isoDateOnly,
};

export type { CompSourceId };
