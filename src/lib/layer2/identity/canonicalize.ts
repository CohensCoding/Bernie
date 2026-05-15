/**
 * Canonical card identity: slug generation + DB lookup-or-insert.
 *
 * Slug template (locked, see docs/LAYER_2_DECISIONS.md):
 *   {set-slug}-{year}-{card-number}-{player-slug}-{parallel-slug or 'base'}
 *
 * The slug is the primary key of `canonical_cards`. It is deterministic
 * given a `CardIdentity`: identical inputs always produce the same slug,
 * so two independent ingest paths that derive the same identity land on
 * the same row without an explicit lookup.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardIdentity } from '@/lib/layer2/types';
import { slugify } from '@/lib/layer2/identity/normalize';

export type AliasSource = 'manual' | 'ximilar' | 'llm_parse' | 'user_correction';

export type CanonicalizeResult = {
  canonicalCardId: string;
  created: boolean;
};

/**
 * Pure slug derivation. No I/O. Stable across runs.
 *
 *   {
 *     player: 'Luka Dončić', year: 2018, setName: 'Panini Prizm',
 *     cardNumber: '280', parallel: 'Silver', ...
 *   }
 *   → 'panini-prizm-2018-280-luka-doncic-silver'
 *
 * Notes:
 *  - When `cardNumber` is missing we omit the segment but keep dashes
 *    stable: `panini-prizm-2018-luka-doncic-silver`.
 *  - When `parallel` is missing or empty, the slug ends with `-base` to
 *    distinguish "base card" from "unknown parallel" — base IS a known
 *    state. The spec example contradicted itself on this point; see
 *    docs/LAYER_2_DECISIONS.md.
 */
export function slugifyIdentity(identity: CardIdentity): string {
  const setSlug = slugify(identity.setName);
  const playerSlug = slugify(identity.player);
  const parallelSlug = identity.parallel ? slugify(identity.parallel) : 'base';
  const year = String(identity.year);

  const parts: string[] = [setSlug, year];
  if (identity.cardNumber && identity.cardNumber.trim().length > 0) {
    parts.push(slugify(identity.cardNumber));
  }
  parts.push(playerSlug, parallelSlug);
  return parts.join('-');
}

/**
 * Row shape for `public.canonical_cards`.
 */
type CanonicalCardRow = {
  id: string;
  player: string;
  year: number;
  set_name: string;
  card_number: string | null;
  parallel: string | null;
  is_rookie: boolean;
  is_autograph: boolean;
  is_patch: boolean;
};

function rowFromIdentity(identity: CardIdentity, id: string): CanonicalCardRow {
  return {
    id,
    player: identity.player,
    year: identity.year,
    set_name: identity.setName,
    card_number: identity.cardNumber ?? null,
    parallel: identity.parallel ?? null,
    is_rookie: Boolean(identity.isRookie),
    is_autograph: Boolean(identity.isAutograph),
    is_patch: Boolean(identity.isPatch),
  };
}

/**
 * Resolve a `CardIdentity` to a canonical id, creating the row + alias
 * link if missing. Idempotent — concurrent callers settle on the same id
 * thanks to slug determinism + the table's primary-key constraint.
 *
 * `alias` is the lookup string a user / parser fed into the system; it is
 * stored in `card_aliases` so future identical queries can short-circuit
 * the LLM parse.
 */
export async function ensureCanonicalCard(args: {
  supabase: SupabaseClient;
  identity: CardIdentity;
  alias?: string;
  aliasSource?: AliasSource;
  aliasConfidence?: number;
}): Promise<CanonicalizeResult> {
  const id = slugifyIdentity(args.identity);
  const row = rowFromIdentity(args.identity, id);

  // `onConflict: 'id'` + `ignoreDuplicates: false` does an UPSERT but the
  // returned `data` will reflect the latest row regardless of who wrote
  // it. We only treat it as "created" if no row existed before; check
  // that via a probe select afterwards.
  const probe = await args.supabase
    .from('canonical_cards')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  const existed = Boolean(probe.data);

  if (!existed) {
    const insert = await args.supabase.from('canonical_cards').insert(row);
    if (insert.error) {
      // Race: someone else inserted between the probe and the insert.
      // PK conflict (code 23505) is fine; re-read.
      const code = (insert.error as { code?: string }).code;
      if (code !== '23505') {
        throw new Error(
          `ensureCanonicalCard: insert failed (${code ?? 'unknown'}): ${insert.error.message}`,
        );
      }
    }
  }

  // Persist the alias mapping so subsequent identical queries skip the
  // parse step entirely.
  if (args.alias && args.alias.trim().length > 0) {
    const aliasRow = {
      alias: args.alias.trim(),
      canonical_card_id: id,
      confidence: args.aliasConfidence ?? 1.0,
      source: args.aliasSource ?? 'manual',
    };
    const aliasUp = await args.supabase
      .from('card_aliases')
      .upsert(aliasRow, { onConflict: 'alias' });
    if (aliasUp.error) {
      // Non-fatal — alias is a perf optimization, not a correctness gate.
      console.warn(
        `[layer2] alias upsert failed for "${args.alias}": ${aliasUp.error.message}`,
      );
    }
  }

  return { canonicalCardId: id, created: !existed };
}

/**
 * Try the alias short-circuit: if a previously-resolved query string maps
 * to a canonical card, return it without re-parsing.
 */
export async function lookupAlias(args: {
  supabase: SupabaseClient;
  alias: string;
}): Promise<string | null> {
  const trimmed = args.alias.trim();
  if (!trimmed) return null;
  const { data, error } = await args.supabase
    .from('card_aliases')
    .select('canonical_card_id')
    .eq('alias', trimmed)
    .maybeSingle();
  if (error || !data) return null;
  return data.canonical_card_id as string;
}
