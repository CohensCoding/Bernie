/**
 * Source fan-out orchestrator.
 *
 * Calls every available `CompSource` in parallel, collecting their
 * results. Sources that throw or return `ok: false` are recorded as
 * degraded; the orchestrator still returns whatever comps the surviving
 * sources produced (rule 8 — graceful degradation).
 *
 * The orchestrator does NOT decide what's FMV-eligible — that's the
 * FMV compute module's job. It just hands back the raw union of comps.
 */

import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';
import { ebaySource } from '@/lib/layer2/sources/ebay';
import { ebayScrapeSource } from '@/lib/layer2/sources/ebayScrape';
import { cardHedgeSource } from '@/lib/layer2/sources/cardhedge';
import { oneThirtyPointSource } from '@/lib/layer2/sources/onethirtypoint';
import { psaSource } from '@/lib/layer2/sources/psa';
import type { CompSourceId, RawComp } from '@/lib/layer2/types';

export const ALL_SOURCES: readonly CompSource[] = [
  ebaySource,
  ebayScrapeSource,
  cardHedgeSource,
  oneThirtyPointSource,
  psaSource,
];

export type SourceFanoutResult = {
  comps: RawComp[];
  perSource: Record<string, { ok: boolean; count: number; reason?: string }>;
  /** Sources we attempted (subset of ALL_SOURCES filtered by isAvailable). */
  attempted: CompSourceId[];
  /** Sources we skipped because they reported unavailable. */
  skipped: CompSourceId[];
};

/**
 * Fan out a comp query across every available source. Each source has
 * its own 5s + 1-retry budget inside its adapter; this function adds no
 * global timeout. Adapters that throw are caught here and reported as
 * degraded so one bad source can't tank the whole lookup.
 *
 * The `sources` argument is injectable for testing; production callers
 * use the default `ALL_SOURCES`.
 */
export async function fanoutComps(
  query: CompQuery,
  sources: readonly CompSource[] = ALL_SOURCES,
): Promise<SourceFanoutResult> {
  const attempted: CompSourceId[] = [];
  const skipped: CompSourceId[] = [];

  const tasks = sources.map((source) => {
    if (!source.isAvailable()) {
      skipped.push(source.id);
      return Promise.resolve<{ source: CompSource; result: CompFetchResult }>({
        source,
        result: {
          ok: false,
          source: source.id,
          reason: 'source unavailable',
        },
      });
    }
    attempted.push(source.id);
    return source
      .fetchComps(query)
      .then((result) => ({ source, result }))
      .catch((e: unknown) => ({
        source,
        result: {
          ok: false,
          source: source.id,
          reason: e instanceof Error ? e.message : 'unknown error',
        } as const,
      }));
  });

  const settled = await Promise.all(tasks);

  const comps: RawComp[] = [];
  const perSource: Record<string, { ok: boolean; count: number; reason?: string }> = {};
  for (const { source, result } of settled) {
    if (result.ok) {
      comps.push(...result.comps);
      perSource[source.id] = { ok: true, count: result.comps.length };
    } else {
      perSource[source.id] = { ok: false, count: 0, reason: result.reason };
    }
  }

  return { comps, perSource, attempted, skipped };
}
