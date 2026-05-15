/**
 * Read-through cache for raw comps.
 *
 * Cache layer = `public.card_comps`. We treat any row with
 * `fetched_at > now() - 1h` as fresh; on miss, the orchestrator fans out
 * to source adapters, persists results, and re-reads.
 *
 * Per rule 7, the maximum TTL is 1 hour. We expose `computedAt` (the
 * youngest `fetched_at` in the returned set) so the route layer can
 * surface it in the response.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Comp,
  CompSourceId,
  Grade,
  Grader,
  RawComp,
  SaleType,
} from '@/lib/layer2/types';

export const COMPS_CACHE_TTL_MS = 60 * 60 * 1000;
export const COMPS_LOOKBACK_DAYS = 90;

type CompRow = {
  id: string;
  canonical_card_id: string;
  grader: string;
  grade: string;
  source: string;
  source_listing_id: string | null;
  sale_price_cents: number;
  sale_date: string;
  sale_type: string | null;
  listing_url: string | null;
  raw_payload: unknown;
  fetched_at: string;
};

function rowToComp(r: CompRow): Comp {
  return {
    id: r.id,
    canonicalCardId: r.canonical_card_id,
    grader: r.grader as Grader,
    grade: r.grade as Grade,
    source: r.source as CompSourceId,
    sourceListingId: r.source_listing_id,
    salePriceCents: r.sale_price_cents,
    saleDate: r.sale_date,
    saleType: (r.sale_type as SaleType | null) ?? 'unknown',
    listingUrl: r.listing_url,
    rawPayload: r.raw_payload,
    fetchedAt: r.fetched_at,
  };
}

export type ReadCompsArgs = {
  supabase: SupabaseClient;
  canonicalCardId: string;
  grader: Grader;
  grade: Grade;
  /** Override the default 90-day window if needed. */
  daysBack?: number;
};

export type CompsReadResult = {
  comps: Comp[];
  /** Youngest `fetched_at` across the basket; null on empty. */
  computedAt: string | null;
  /** True iff the youngest fetch is within the cache TTL. */
  isFresh: boolean;
};

/**
 * Read all comps for a (card, grader, grade) tuple within the lookback
 * window. Sets `isFresh = false` when nothing has been ingested recently
 * enough to trust without a re-fetch.
 */
export async function readComps(args: ReadCompsArgs): Promise<CompsReadResult> {
  const daysBack = args.daysBack ?? COMPS_LOOKBACK_DAYS;
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await args.supabase
    .from('card_comps')
    .select(
      'id,canonical_card_id,grader,grade,source,source_listing_id,sale_price_cents,sale_date,sale_type,listing_url,raw_payload,fetched_at',
    )
    .eq('canonical_card_id', args.canonicalCardId)
    .eq('grader', args.grader)
    .eq('grade', args.grade)
    .gte('sale_date', sinceDate)
    .order('sale_date', { ascending: false });

  if (error) {
    throw new Error(`readComps: ${error.message}`);
  }

  const comps: Comp[] = (data ?? []).map((row) => rowToComp(row as CompRow));
  const youngestMs = comps.reduce<number | null>((max, c) => {
    const ms = Date.parse(c.fetchedAt);
    if (!Number.isFinite(ms)) return max;
    return max == null ? ms : Math.max(max, ms);
  }, null);

  const computedAt = youngestMs != null ? new Date(youngestMs).toISOString() : null;
  const isFresh = youngestMs != null && Date.now() - youngestMs <= COMPS_CACHE_TTL_MS;

  return { comps, computedAt, isFresh };
}

export type PersistCompsArgs = {
  supabase: SupabaseClient;
  canonicalCardId: string;
  rawComps: readonly RawComp[];
};

/**
 * Upsert a batch of raw comps. Rows with a non-null `sourceListingId` use
 * `upsert` on `(source, source_listing_id)` against the full unique index
 * `card_comps_source_listing_uq` (see `supabase/schema.sql`). Rows with a
 * null listing id use plain `insert` — duplicates are acceptable when the
 * source cannot provide a stable key.
 */
export async function persistComps(args: PersistCompsArgs): Promise<{ inserted: number }> {
  if (args.rawComps.length === 0) return { inserted: 0 };

  const withListing = args.rawComps.filter((c) => c.sourceListingId != null);
  const withoutListing = args.rawComps.filter((c) => c.sourceListingId == null);

  let inserted = 0;

  if (withListing.length > 0) {
    const rows = withListing.map((c) => ({
      canonical_card_id: args.canonicalCardId,
      grader: c.grader,
      grade: c.grade,
      source: c.source,
      source_listing_id: c.sourceListingId,
      sale_price_cents: c.salePriceCents,
      sale_date: c.saleDate,
      sale_type: c.saleType,
      listing_url: c.listingUrl,
      raw_payload: c.rawPayload ?? null,
    }));
    const up = await args.supabase
      .from('card_comps')
      .upsert(rows, { onConflict: 'source,source_listing_id' });
    if (up.error) {
      throw new Error(`persistComps (upsert with listing): ${up.error.message}`);
    }
    inserted += rows.length;
  }

  if (withoutListing.length > 0) {
    const rows = withoutListing.map((c) => ({
      canonical_card_id: args.canonicalCardId,
      grader: c.grader,
      grade: c.grade,
      source: c.source,
      source_listing_id: null,
      sale_price_cents: c.salePriceCents,
      sale_date: c.saleDate,
      sale_type: c.saleType,
      listing_url: c.listingUrl,
      raw_payload: c.rawPayload ?? null,
    }));
    const ins = await args.supabase.from('card_comps').insert(rows);
    if (ins.error) {
      throw new Error(`persistComps (insert no listing): ${ins.error.message}`);
    }
    inserted += rows.length;
  }

  return { inserted };
}

/**
 * Stable merge key for comps that carry a listing id. Returns null when
 * the row cannot be deduped (null listing id — each ingest row is kept).
 */
export function compDedupeKey(c: Pick<Comp, 'source' | 'sourceListingId'>): string | null {
  if (c.sourceListingId == null || c.sourceListingId === '') return null;
  return `${c.source}\0${c.sourceListingId}`;
}

/**
 * Turn fan-out results into `Comp` shapes for the API wire when rows were
 * not persisted (or before DB assigns UUIDs). Ids are synthetic `mem:…`
 * strings so the UI can still render rows.
 */
export function rawCompsToMemoryComps(
  canonicalCardId: string,
  raw: readonly RawComp[],
): Comp[] {
  const fetchedAt = new Date().toISOString();
  return raw.map((c, i) => ({
    ...c,
    id:
      c.sourceListingId != null && c.sourceListingId !== ''
        ? `mem:${c.source}:${c.sourceListingId}`
        : `mem:${c.source}:noid:${i}`,
    canonicalCardId,
    fetchedAt,
  }));
}

/**
 * After a failed cache write, merge whatever `readComps` returned with the
 * in-memory fan-out basket. Rows keyed by `(source, listingId)` are
 * deduped with **memory winning** so freshly fetched prices surface. Rows
 * without a listing id are concatenated (duplicates allowed).
 */
export function mergeDbCompsWithFanoutFallback(
  dbComps: readonly Comp[],
  canonicalCardId: string,
  fanoutRaw: readonly RawComp[],
): Comp[] {
  const memory = rawCompsToMemoryComps(canonicalCardId, fanoutRaw);
  const byKey = new Map<string, Comp>();
  const noKey: Comp[] = [];

  for (const c of dbComps) {
    const k = compDedupeKey(c);
    if (k) byKey.set(k, c);
    else noKey.push(c);
  }
  for (const c of memory) {
    const k = compDedupeKey(c);
    if (k) byKey.set(k, c);
    else noKey.push(c);
  }

  return [...byKey.values(), ...noKey];
}
