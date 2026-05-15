/**
 * Shared types for Layer 2 (comp & FMV intelligence).
 *
 * See:
 *  - docs/LAYER_2_SPEC.md          original spec
 *  - docs/LAYER_2_DECISIONS.md     deltas from spec, locked-in choices
 *
 * Reliability rules (project rule + spec):
 *  - FMV is never a single number; always include 95% CI + sample size.
 *  - Never compute FMV with sample size < 3.
 *  - Money is integer cents. Never floats for prices on the wire.
 *  - Methodology versioning: any change to FMV math bumps `MethodologyVersion`.
 */

export type Grader = 'PSA' | 'BGS' | 'SGC' | 'CGC' | 'RAW';

/**
 * Grade label. Intentionally a string (not enum): the universe is large and
 * grader-specific (BGS half-grades, SGC plusses, raw NM/EX/etc.).
 * Normalize via identity/normalize.ts before persisting.
 */
export type Grade = string;

/**
 * Sale type for a single comp. The spec defines four kinds for actual sales
 * plus `active_listing` for eBay Browse results, which are listings (not
 * sales) and never feed FMV math but may be displayed for reference.
 */
export type SaleType =
  | 'bin'
  | 'auction'
  | 'best_offer_accepted'
  | 'active_listing'
  | 'unknown';

/**
 * Identifier for a comp source. Mirrors the
 * `card_comps_source_known` check constraint in `supabase/schema.sql`.
 */
export type CompSourceId =
  | 'ebay_marketplace_insights'
  | 'ebay_browse'
  | 'ebay_scrape'
  | 'cardhedge'
  | '130point'
  | 'card_ladder_manual'
  | 'psa';

/**
 * Sources whose comps are eligible to enter the FMV calculation.
 *
 * Excluded by design (per decisions D4):
 *  - `ebay_browse`     active listings, listings ≠ sales
 *  - `ebay_scrape`     unverified HTML scrape; UI-only backstop
 *
 * Future sources may be added here when wired up in Phase 4.
 */
export const FMV_ELIGIBLE_SOURCES: readonly CompSourceId[] = [
  'ebay_marketplace_insights',
  'cardhedge',
  '130point',
  'card_ladder_manual',
  'psa',
] as const;

export function isFmvEligibleSource(s: CompSourceId): boolean {
  return (FMV_ELIGIBLE_SOURCES as readonly string[]).includes(s);
}

/**
 * Parsed identity for a card. This is Layer 2's view of identity; it
 * intentionally differs from `src/lib/valuation/types.ts#CardIdentity`
 * which serves Layer 1's valuation pipeline. Coexistence is intentional
 * (decisions D1); the two types are not interchangeable.
 */
export type CardIdentity = {
  player: string;
  year: number;
  setName: string;
  cardNumber?: string;
  parallel?: string;
  isRookie?: boolean;
  isAutograph?: boolean;
  isPatch?: boolean;
  grader: Grader;
  grade: Grade;
};

/**
 * A comp as returned by a `CompSource` adapter, before persistence.
 * `sourceListingId` is optional because some sources (notably the eBay
 * HTML scraper) don't expose a stable listing identifier.
 */
export type RawComp = {
  source: CompSourceId;
  sourceListingId: string | null;
  grader: Grader;
  grade: Grade;
  salePriceCents: number;
  saleDate: string; // ISO date 'YYYY-MM-DD'
  saleType: SaleType;
  listingUrl: string | null;
  rawPayload?: unknown;
};

/**
 * A persisted comp. Mirrors `public.card_comps` plus the canonical FK.
 */
export type Comp = RawComp & {
  id: string;
  canonicalCardId: string;
  fetchedAt: string; // ISO timestamp
};

/**
 * Methodology version for FMV math. Bump on any behavioral change.
 * Locked at v1.0.0 per spec; see docs/LAYER_2_DECISIONS.md D5.
 */
export type MethodologyVersion = 'v1.0.0';
export const CURRENT_METHODOLOGY: MethodologyVersion = 'v1.0.0';

/** Structured warning surfaced on successful lookup responses (HTTP 200). */
export type LookupResponseWarning = {
  code: 'persist_failed';
  message: string;
};

/**
 * The shape returned by `fmv/compute.ts`. Discriminated by `status`.
 *
 * Only `OK` results are persisted to `public.card_fmv`. INSUFFICIENT_DATA
 * variants are computed at request time and not cached as FMV rows.
 */
export type FmvResult =
  | {
      status: 'OK';
      fmvCents: number;
      ciLowCents: number;
      ciHighCents: number;
      sampleSize: number;
      compsUsed: Comp[];
      compsExcluded: Comp[];
      isStale: boolean;
      daysSinceLastSale: number;
      dateRangeStart: string; // ISO date
      dateRangeEnd: string; // ISO date
      methodologyVersion: MethodologyVersion;
    }
  | {
      status: 'INSUFFICIENT_DATA';
      sampleSize: number;
      compsAvailable: Comp[];
      methodologyVersion: MethodologyVersion;
    }
  | {
      status: 'INSUFFICIENT_DATA_AFTER_OUTLIERS';
      sampleSize: number;
      compsAvailable: Comp[];
      compsExcluded: Comp[];
      methodologyVersion: MethodologyVersion;
    };

/**
 * Bag of weights attached to an included comp during FMV math.
 */
export type WeightedComp = Comp & {
  recencyWeight: number;
  saleTypeWeight: number;
  weight: number; // recencyWeight * saleTypeWeight
};
