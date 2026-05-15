/**
 * Read-through cache for computed FMVs.
 *
 * Cache layer = `public.card_fmv`. Cache key is
 * `(canonical_card_id, grader, grade, methodology_version)` — the
 * unique index in schema.
 *
 * Per rule 7, the maximum TTL is 6 hours; we always write a 6h
 * `expires_at`. Read returns a cached row only if `expires_at > now()`
 * AND the methodology version matches `CURRENT_METHODOLOGY`. The route
 * layer always shows `computedAt` alongside whatever FMV we return.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURRENT_METHODOLOGY,
  type FmvResult,
  type Grade,
  type Grader,
  type MethodologyVersion,
} from '@/lib/layer2/types';

export const FMV_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type CachedFmv = {
  fmvCents: number;
  ciLowCents: number;
  ciHighCents: number;
  sampleSize: number;
  compsUsedIds: string[];
  compsExcludedIds: string[];
  methodologyVersion: MethodologyVersion;
  isStale: boolean;
  dateRangeStart: string;
  dateRangeEnd: string;
  computedAt: string;
  expiresAt: string;
};

type FmvRow = {
  fmv_cents: number;
  ci_low_cents: number;
  ci_high_cents: number;
  sample_size: number;
  comps_used: string[];
  comps_excluded: string[];
  methodology_version: string;
  is_stale: boolean;
  date_range_start: string;
  date_range_end: string;
  computed_at: string;
  expires_at: string;
};

export type ReadFmvArgs = {
  supabase: SupabaseClient;
  canonicalCardId: string;
  grader: Grader;
  grade: Grade;
};

/**
 * Return a cached FMV if one exists for the current methodology and has
 * not expired. Otherwise null.
 */
export async function readFmv(args: ReadFmvArgs): Promise<CachedFmv | null> {
  const { data, error } = await args.supabase
    .from('card_fmv')
    .select(
      'fmv_cents,ci_low_cents,ci_high_cents,sample_size,comps_used,comps_excluded,methodology_version,is_stale,date_range_start,date_range_end,computed_at,expires_at',
    )
    .eq('canonical_card_id', args.canonicalCardId)
    .eq('grader', args.grader)
    .eq('grade', args.grade)
    .eq('methodology_version', CURRENT_METHODOLOGY)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as FmvRow;

  if (Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }
  if (row.methodology_version !== CURRENT_METHODOLOGY) {
    return null;
  }

  return {
    fmvCents: row.fmv_cents,
    ciLowCents: row.ci_low_cents,
    ciHighCents: row.ci_high_cents,
    sampleSize: row.sample_size,
    compsUsedIds: row.comps_used,
    compsExcludedIds: row.comps_excluded,
    methodologyVersion: CURRENT_METHODOLOGY,
    isStale: row.is_stale,
    dateRangeStart: row.date_range_start,
    dateRangeEnd: row.date_range_end,
    computedAt: row.computed_at,
    expiresAt: row.expires_at,
  };
}

export type WriteFmvArgs = {
  supabase: SupabaseClient;
  canonicalCardId: string;
  grader: Grader;
  grade: Grade;
  result: Extract<FmvResult, { status: 'OK' }>;
};

/**
 * Persist an OK FMV result. The table's unique index on
 * `(canonical_card_id, grader, grade, methodology_version)` means an
 * UPSERT replaces a stale row for the same methodology without ever
 * shadowing a different methodology's history.
 */
export async function writeFmv(args: WriteFmvArgs): Promise<void> {
  const now = Date.now();
  const expiresAt = new Date(now + FMV_CACHE_TTL_MS).toISOString();
  const computedAt = new Date(now).toISOString();

  const row = {
    canonical_card_id: args.canonicalCardId,
    grader: args.grader,
    grade: args.grade,
    fmv_cents: args.result.fmvCents,
    ci_low_cents: args.result.ciLowCents,
    ci_high_cents: args.result.ciHighCents,
    sample_size: args.result.sampleSize,
    comps_used: args.result.compsUsed.map((c) => c.id),
    comps_excluded: args.result.compsExcluded.map((c) => c.id),
    methodology_version: args.result.methodologyVersion,
    date_range_start: args.result.dateRangeStart,
    date_range_end: args.result.dateRangeEnd,
    is_stale: args.result.isStale,
    computed_at: computedAt,
    expires_at: expiresAt,
  };

  const { error } = await args.supabase
    .from('card_fmv')
    .upsert(row, { onConflict: 'canonical_card_id,grader,grade,methodology_version' });
  if (error) {
    throw new Error(`writeFmv: ${error.message}`);
  }
}
