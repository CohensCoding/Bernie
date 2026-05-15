/**
 * Tests for the source fan-out orchestrator.
 *
 * Critical contract under test (rule 8 — graceful degradation): a single
 * misbehaving source MUST NOT tank the rest of the lookup. The
 * orchestrator catches throws + non-ok results, returns the surviving
 * sources' comps, and surfaces per-source health so the route can show
 * a "partial data" indicator.
 */

import { describe, expect, it } from 'vitest';

import { fanoutComps } from '@/lib/layer2/sources/orchestrator';
import type { CompFetchResult, CompQuery, CompSource } from '@/lib/layer2/sources/types';
import type { CompSourceId, RawComp } from '@/lib/layer2/types';

const QUERY: CompQuery = {
  canonicalId: 'panini-prizm-2018-280-luka-doncic-silver',
  player: 'Luka Doncic',
  year: 2018,
  setName: 'Panini Prizm',
  cardNumber: '280',
  parallel: 'Silver',
  grader: 'PSA',
  grade: '10',
  daysBack: 90,
};

function fakeComp(salePriceCents: number, idx: number): RawComp {
  return {
    source: 'cardhedge',
    sourceListingId: `fake-${idx}`,
    grader: 'PSA',
    grade: '10',
    salePriceCents,
    saleDate: '2026-05-01',
    saleType: 'auction',
    listingUrl: null,
  };
}

function makeSource(
  id: CompSourceId,
  behavior: 'throws' | 'unavailable' | 'fails' | { comps: RawComp[] },
): CompSource {
  return {
    id,
    isAvailable: () => behavior !== 'unavailable',
    async fetchComps(_q: CompQuery): Promise<CompFetchResult> {
      if (behavior === 'throws') {
        throw new Error(`boom from ${id}`);
      }
      if (behavior === 'fails') {
        return { ok: false, source: id, reason: `${id} explicit failure` };
      }
      if (behavior === 'unavailable') {
        // Should not be invoked — isAvailable() returns false.
        return { ok: false, source: id, reason: 'unreachable' };
      }
      return { ok: true, source: id, comps: behavior.comps };
    },
  };
}

describe('fanoutComps — partial-failure resilience', () => {
  it('returns B\'s results when A throws and B succeeds, and captures A\'s error', async () => {
    const a = makeSource('cardhedge', 'throws');
    const b = makeSource('130point', {
      comps: [fakeComp(50_000, 1), fakeComp(51_000, 2)],
    });

    const result = await fanoutComps(QUERY, [a, b]);

    // B's comps come through.
    expect(result.comps).toHaveLength(2);
    expect(result.comps.map((c) => c.salePriceCents)).toEqual([50_000, 51_000]);

    // A is reported as failed with the actual error message captured.
    expect(result.perSource['cardhedge']).toBeDefined();
    expect(result.perSource['cardhedge']!.ok).toBe(false);
    expect(result.perSource['cardhedge']!.count).toBe(0);
    expect(result.perSource['cardhedge']!.reason).toBe('boom from cardhedge');

    // B is reported as ok with the comp count.
    expect(result.perSource['130point']).toEqual({ ok: true, count: 2 });

    // Both were attempted (neither marked themselves unavailable).
    expect(result.attempted).toEqual(['cardhedge', '130point']);
    expect(result.skipped).toEqual([]);
  });

  it('captures explicit `{ ok: false }` reasons (not just thrown errors)', async () => {
    const a = makeSource('cardhedge', 'fails');
    const b = makeSource('130point', { comps: [fakeComp(99_000, 1)] });

    const result = await fanoutComps(QUERY, [a, b]);
    expect(result.comps).toEqual([expect.objectContaining({ salePriceCents: 99_000 })]);
    expect(result.perSource['cardhedge']).toEqual({
      ok: false,
      count: 0,
      reason: 'cardhedge explicit failure',
    });
  });

  it('marks unavailable sources as skipped without invoking fetchComps', async () => {
    let invoked = false;
    const a: CompSource = {
      id: 'cardhedge',
      isAvailable: () => false,
      async fetchComps() {
        invoked = true;
        return { ok: true, source: 'cardhedge', comps: [] };
      },
    };
    const b = makeSource('130point', { comps: [fakeComp(10_000, 1)] });

    const result = await fanoutComps(QUERY, [a, b]);
    expect(invoked).toBe(false);
    expect(result.skipped).toContain('cardhedge');
    expect(result.attempted).toEqual(['130point']);
    expect(result.perSource['cardhedge']!.ok).toBe(false);
    expect(result.perSource['cardhedge']!.reason).toBe('source unavailable');
    expect(result.comps).toHaveLength(1);
  });

  it('returns an empty basket but no crash when every source fails', async () => {
    const a = makeSource('cardhedge', 'throws');
    const b = makeSource('130point', 'fails');
    const c = makeSource('psa', 'throws');

    const result = await fanoutComps(QUERY, [a, b, c]);
    expect(result.comps).toEqual([]);
    expect(Object.values(result.perSource).every((s) => s.ok === false)).toBe(true);
    expect(result.perSource['cardhedge']!.reason).toBe('boom from cardhedge');
    expect(result.perSource['130point']!.reason).toBe('130point explicit failure');
    expect(result.perSource['psa']!.reason).toBe('boom from psa');
  });
});
