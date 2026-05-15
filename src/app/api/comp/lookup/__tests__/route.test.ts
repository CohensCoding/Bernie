import { describe, it, expect, vi, beforeEach } from 'vitest';

const parseQueryMock = vi.hoisted(() => vi.fn());
const ensureCanonicalCardMock = vi.hoisted(() => vi.fn());
const lookupAliasMock = vi.hoisted(() => vi.fn());
const fanoutCompsMock = vi.hoisted(() => vi.fn());
const persistCompsMock = vi.hoisted(() => vi.fn());
const readCompsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));

vi.mock('@/lib/layer2/cache/fmv', () => ({
  writeFmv: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/layer2/identity/parse', () => ({
  parseQuery: parseQueryMock,
}));

vi.mock('@/lib/layer2/identity/canonicalize', () => ({
  ensureCanonicalCard: ensureCanonicalCardMock,
  lookupAlias: lookupAliasMock,
}));

vi.mock('@/lib/layer2/sources/orchestrator', () => ({
  fanoutComps: fanoutCompsMock,
}));

vi.mock('@/lib/layer2/cache/comps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/layer2/cache/comps')>();
  return {
    ...actual,
    persistComps: persistCompsMock,
    readComps: readCompsMock,
  };
});

import { POST } from '@/app/api/comp/lookup/route';
import type { Comp, RawComp } from '@/lib/layer2/types';

const browseRaw: RawComp = {
  source: 'ebay_browse',
  sourceListingId: 'v1|999|0',
  grader: 'PSA',
  grade: '10',
  salePriceCents: 1600_00,
  saleDate: '2026-05-13',
  saleType: 'active_listing',
  listingUrl: 'https://www.ebay.com/itm/999',
};

function jsonRequest(body: unknown) {
  return new Request('http://localhost:3001/api/comp/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/comp/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseQueryMock.mockResolvedValue({
      ok: true,
      source: 'heuristic',
      identity: {
        player: 'Luka Dončić',
        year: 2018,
        setName: 'Panini Prizm',
        parallel: 'silver',
        grader: 'PSA',
        grade: '10',
      },
    });
    ensureCanonicalCardMock.mockResolvedValue({
      canonicalCardId: 'panini-prizm-2018-luka-doncic-silver',
      created: false,
    });
    lookupAliasMock.mockResolvedValue(null);
    fanoutCompsMock.mockResolvedValue({
      comps: [browseRaw],
      perSource: { ebay_marketplace_insights: { ok: true, count: 1 } },
      attempted: ['ebay_marketplace_insights'],
      skipped: [],
    });
  });

  it('when persistComps throws, returns 200 with referenceComps from fan-out and persist_failed warning', async () => {
    persistCompsMock.mockRejectedValue(new Error('persistComps (upsert with listing): failed'));
    readCompsMock
      .mockResolvedValueOnce({ comps: [], computedAt: null, isFresh: false })
      .mockResolvedValueOnce({ comps: [], computedAt: null, isFresh: false });

    const res = await POST(jsonRequest({ query: '2018 Panini Prizm Luka Silver', grade: 'PSA 10' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      warnings: { code: string; message: string }[];
      referenceComps: Comp[];
      status: string;
    };
    expect(json.status).toBe('INSUFFICIENT_DATA');
    expect(json.warnings).toEqual([
      { code: 'persist_failed', message: 'persistComps (upsert with listing): failed' },
    ]);
    expect(json.referenceComps).toHaveLength(1);
    expect(json.referenceComps[0]!.source).toBe('ebay_browse');
    expect(json.referenceComps[0]!.salePriceCents).toBe(1600_00);
    expect(json.referenceComps[0]!.id.startsWith('mem:')).toBe(true);
  });

  it('when persist succeeds, uses readComps basket and leaves warnings empty', async () => {
    persistCompsMock.mockResolvedValue({ inserted: 1 });
    const dbComp: Comp = {
      id: '11111111-1111-1111-1111-111111111111',
      canonicalCardId: 'panini-prizm-2018-luka-doncic-silver',
      source: 'ebay_browse',
      sourceListingId: 'v1|999|0',
      grader: 'PSA',
      grade: '10',
      salePriceCents: 1600_00,
      saleDate: '2026-05-13',
      saleType: 'active_listing',
      listingUrl: 'https://www.ebay.com/itm/999',
      fetchedAt: '2026-05-13T20:00:00.000Z',
    };
    readCompsMock
      .mockResolvedValueOnce({ comps: [], computedAt: null, isFresh: false })
      .mockResolvedValueOnce({
        comps: [dbComp],
        computedAt: '2026-05-13T20:00:00.000Z',
        isFresh: true,
      });

    const res = await POST(jsonRequest({ query: '2018 Panini Prizm Luka Silver', grade: 'PSA 10' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { warnings: unknown[]; referenceComps: Comp[] };
    expect(json.warnings).toEqual([]);
    expect(json.referenceComps).toHaveLength(1);
    expect(json.referenceComps[0]!.id).toBe('11111111-1111-1111-1111-111111111111');
  });
});
