/**
 * POST /api/comp/lookup
 *
 * Phase 1 entrypoint for "is this card a fair price right now?"
 *
 * Flow:
 *   1. Validate input. Body shape: `{ query: string; grade?: string }`.
 *   2. Parse identity via heuristic + (optional) OpenAI.
 *   3. Canonicalize → `canonical_card_id`. Persist alias.
 *   4. Read-through the comps cache. On miss / stale, fan out to source
 *      adapters and persist the results.
 *   5. Compute FMV (or INSUFFICIENT_DATA). Persist OK results to the
 *      FMV cache.
 *   6. Return the FMV, used + excluded comps, reference (display-only)
 *      comps from non-FMV sources, source health, methodology version,
 *      and computed_at timestamp.
 *
 * Reliability invariants:
 *   - Never returns an FMV without sample size + CI.
 *   - Returns INSUFFICIENT_DATA with available comps if n < 3.
 *   - Surfaces per-source `ok/reason` so the UI can render
 *     "partial data" indicators (rule 8).
 *   - Methodology version is always present in the response.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@/lib/supabase/server';

import { computeFmv } from '@/lib/layer2/fmv/compute';
import { writeFmv } from '@/lib/layer2/cache/fmv';
import { persistComps, readComps, mergeDbCompsWithFanoutFallback } from '@/lib/layer2/cache/comps';
import {
  ensureCanonicalCard,
  lookupAlias,
} from '@/lib/layer2/identity/canonicalize';
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  query: z.string().min(2).max(300),
  grade: z.string().min(1).max(40).optional(),
});

type ResponseBody =
  | {
      status: 'OK';
      canonicalCardId: string;
      identity: ReturnType<typeof identityShape>;
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
      identity: ReturnType<typeof identityShape>;
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
}) {
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

export async function POST(req: Request): Promise<NextResponse<ResponseBody | { error: string }>> {
  let payload: { query: string; grade?: string };
  try {
    const json = await req.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid request body: ${parsed.error.issues.map((i) => i.message).join('; ')}` },
        { status: 400 },
      );
    }
    payload = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  // 1. Identity parse. If a grade override is supplied, it wins over
  //    whatever the regex extracted.
  const parsed = await parseQuery(payload.query, payload.grade);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: `Could not resolve a card identity from "${payload.query}". ${parsed.reason}`,
      },
      { status: 422 },
    );
  }
  // A grade override is reliability-critical — never silently drop it.
  if (payload.grade) {
    const g = parseGrade(payload.grade);
    if (g) {
      parsed.identity.grader = g.grader;
      parsed.identity.grade = g.grade;
    }
  }

  const warnings: LookupResponseWarning[] = [];

  const supabase = getSupabaseServerClient();
  const aliasKey = normalizeQuery(payload.query);

  // 2. Canonicalize.
  const aliasHit = await lookupAlias({ supabase, alias: aliasKey });
  const canonical = await ensureCanonicalCard({
    supabase,
    identity: parsed.identity,
    alias: aliasKey,
    aliasSource: parsed.source === 'llm' ? 'llm_parse' : 'manual',
  });
  // If the alias already mapped to a different canonical id (e.g. the
  // parser improved over time), keep the historical mapping for now;
  // surface a warning rather than silently re-link.
  if (aliasHit && aliasHit !== canonical.canonicalCardId) {
    console.warn(
      `[layer2/lookup] alias "${aliasKey}" previously mapped to ${aliasHit}; new parse produced ${canonical.canonicalCardId}`,
    );
  }

  // 3. Read-through comps cache.
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
        ? mergeDbCompsWithFanoutFallback(
            refreshed.comps,
            canonical.canonicalCardId,
            fanout.comps,
          )
        : refreshed.comps;
    } else {
      comps = cached.comps;
    }
  } else {
    sourceHealth = { cache: { ok: true, count: comps.length } };
  }

  // 4. Partition into FMV-eligible vs. display-only reference comps.
  const { eligible, reference } = partitionReference(comps);

  // 5. Compute FMV.
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
    return NextResponse.json({
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
    });
  }

  // INSUFFICIENT_DATA / INSUFFICIENT_DATA_AFTER_OUTLIERS
  const compsAvailable = result.compsAvailable;
  const compsExcluded =
    result.status === 'INSUFFICIENT_DATA_AFTER_OUTLIERS' ? result.compsExcluded : undefined;

  return NextResponse.json({
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
  });
}
