/**
 * Shared server-side comp lookup pipeline — same logic as POST /api/comp/lookup.
 * Used by the API route (JSON) and the /comp/result Server Component (no extra HTTP hop).
 */

import { z } from 'zod';

import { getSupabaseServerClient } from '@/lib/supabase/server';

import { computeFmv } from '@/lib/layer2/fmv/compute';
import { writeFmv } from '@/lib/layer2/cache/fmv';
import { mergeDbCompsWithFanoutFallback, persistComps, readComps } from '@/lib/layer2/cache/comps';
import { ensureCanonicalCard, lookupAlias } from '@/lib/layer2/identity/canonicalize';
import { normalizeQuery, parseGrade } from '@/lib/layer2/identity/normalize';
import { parseQuery } from '@/lib/layer2/identity/parse';
import { fanoutComps } from '@/lib/layer2/sources/orchestrator';
import {
  CURRENT_METHODOLOGY,
  isFmvEligibleSource,
  type Comp,
  type FmvResult,
  type LookupResponseWarning,
} from '@/lib/layer2/types';

export const CompLookupBodySchema = z.object({
  query: z.string().min(2).max(300),
  grade: z.string().min(1).max(40).optional(),
});

export type CompLookupBody = z.infer<typeof CompLookupBodySchema>;

export type CompLookupIdentity = {
  player: string;
  year: number;
  setName: string;
  cardNumber: string | null;
  parallel: string | null;
  grader: string;
  grade: string;
};

export type CompLookupOk =
  | {
      status: 'OK';
      canonicalCardId: string;
      identity: CompLookupIdentity;
      fmvCents: number;
      ciLowCents: number;
      ciHighCents: number;
      sampleSize: number;
      compsUsed: Comp[];
      compsExcluded: Comp[];
      referenceComps: Comp[];
      isStale: boolean;
      daysSinceLastSale: number;
      dateRangeStart: string;
      dateRangeEnd: string;
      methodologyVersion: string;
      computedAt: string;
      sourceHealth: Record<string, { ok: boolean; count: number; reason?: string }>;
      cacheHit: boolean;
      warnings: LookupResponseWarning[];
    }
  | {
      status: 'INSUFFICIENT_DATA' | 'INSUFFICIENT_DATA_AFTER_OUTLIERS';
      canonicalCardId: string;
      identity: CompLookupIdentity;
      sampleSize: number;
      compsAvailable: Comp[];
      compsExcluded?: Comp[];
      referenceComps: Comp[];
      methodologyVersion: string;
      computedAt: string;
      sourceHealth: Record<string, { ok: boolean; count: number; reason?: string }>;
      cacheHit: boolean;
      warnings: LookupResponseWarning[];
    };

function identityShape(identity: {
  player: string;
  year: number;
  setName: string;
  cardNumber?: string;
  parallel?: string;
  grader: string;
  grade: string;
}): CompLookupIdentity {
  return {
    player: identity.player,
    year: identity.year,
    setName: identity.setName,
    cardNumber: identity.cardNumber ?? null,
    parallel: identity.parallel ?? null,
    grader: identity.grader,
    grade: identity.grade,
  };
}

function partitionReference(comps: Comp[]): { eligible: Comp[]; reference: Comp[] } {
  const eligible: Comp[] = [];
  const reference: Comp[] = [];
  for (const c of comps) {
    if (isFmvEligibleSource(c.source)) eligible.push(c);
    else reference.push(c);
  }
  return { eligible, reference };
}

export type PerformCompLookupResult =
  | { ok: true; data: CompLookupOk }
  | { ok: false; httpStatus: 422; error: string };

export async function performCompLookup(input: CompLookupBody): Promise<PerformCompLookupResult> {
  const parsed = await parseQuery(input.query, input.grade);
  if (!parsed.ok) {
    return {
      ok: false,
      httpStatus: 422,
      error: `Could not resolve a card identity from "${input.query}". ${parsed.reason}`,
    };
  }

  if (input.grade) {
    const g = parseGrade(input.grade);
    if (g) {
      parsed.identity.grader = g.grader;
      parsed.identity.grade = g.grade;
    }
  }

  const warnings: LookupResponseWarning[] = [];

  const supabase = getSupabaseServerClient();
  const aliasKey = normalizeQuery(input.query);

  const aliasHit = await lookupAlias({ supabase, alias: aliasKey });
  const canonical = await ensureCanonicalCard({
    supabase,
    identity: parsed.identity,
    alias: aliasKey,
    aliasSource: parsed.source === 'llm' ? 'llm_parse' : 'manual',
  });
  if (aliasHit && aliasHit !== canonical.canonicalCardId) {
    console.warn(
      `[layer2/lookup] alias "${aliasKey}" previously mapped to ${aliasHit}; new parse produced ${canonical.canonicalCardId}`,
    );
  }

  const cached = await readComps({
    supabase,
    canonicalCardId: canonical.canonicalCardId,
    grader: parsed.identity.grader,
    grade: parsed.identity.grade,
  });

  let comps: Comp[] = cached.comps;
  let cacheHit = cached.isFresh && cached.comps.length > 0;
  let sourceHealth: Record<string, { ok: boolean; count: number; reason?: string }> = {};

  if (!cacheHit) {
    const fanout = await fanoutComps({
      canonicalId: canonical.canonicalCardId,
      player: parsed.identity.player,
      year: parsed.identity.year,
      setName: parsed.identity.setName,
      cardNumber: parsed.identity.cardNumber,
      parallel: parsed.identity.parallel,
      grader: parsed.identity.grader,
      grade: parsed.identity.grade,
    });
    sourceHealth = fanout.perSource;

    if (fanout.comps.length > 0) {
      let persistFailed = false;
      try {
        await persistComps({
          supabase,
          canonicalCardId: canonical.canonicalCardId,
          rawComps: fanout.comps,
        });
      } catch (e) {
        persistFailed = true;
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push({ code: 'persist_failed', message: msg });
        console.warn(`[layer2/lookup] persistComps failed: ${msg}`);
      }
      const refreshed = await readComps({
        supabase,
        canonicalCardId: canonical.canonicalCardId,
        grader: parsed.identity.grader,
        grade: parsed.identity.grade,
      });
      comps = persistFailed
        ? mergeDbCompsWithFanoutFallback(refreshed.comps, canonical.canonicalCardId, fanout.comps)
        : refreshed.comps;
    } else {
      comps = cached.comps;
    }
  } else {
    sourceHealth = { cache: { ok: true, count: comps.length } };
  }

  const { eligible, reference } = partitionReference(comps);

  const result: FmvResult = computeFmv(eligible);
  const computedAt = new Date().toISOString();

  if (result.status === 'OK') {
    try {
      await writeFmv({
        supabase,
        canonicalCardId: canonical.canonicalCardId,
        grader: parsed.identity.grader,
        grade: parsed.identity.grade,
        result,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      console.warn(`[layer2/lookup] writeFmv failed: ${msg}`);
    }
    return {
      ok: true,
      data: {
        status: 'OK',
        canonicalCardId: canonical.canonicalCardId,
        identity: identityShape(parsed.identity),
        fmvCents: result.fmvCents,
        ciLowCents: result.ciLowCents,
        ciHighCents: result.ciHighCents,
        sampleSize: result.sampleSize,
        compsUsed: result.compsUsed,
        compsExcluded: result.compsExcluded,
        referenceComps: reference,
        isStale: result.isStale,
        daysSinceLastSale: result.daysSinceLastSale,
        dateRangeStart: result.dateRangeStart,
        dateRangeEnd: result.dateRangeEnd,
        methodologyVersion: result.methodologyVersion,
        computedAt,
        sourceHealth,
        cacheHit,
        warnings,
      },
    };
  }

  const compsAvailable = result.compsAvailable;
  const compsExcluded =
    result.status === 'INSUFFICIENT_DATA_AFTER_OUTLIERS' ? result.compsExcluded : undefined;

  return {
    ok: true,
    data: {
      status: result.status,
      canonicalCardId: canonical.canonicalCardId,
      identity: identityShape(parsed.identity),
      sampleSize: result.sampleSize,
      compsAvailable,
      compsExcluded,
      referenceComps: reference,
      methodologyVersion: CURRENT_METHODOLOGY,
      computedAt,
      sourceHealth,
      cacheHit,
      warnings,
    },
  };
}
