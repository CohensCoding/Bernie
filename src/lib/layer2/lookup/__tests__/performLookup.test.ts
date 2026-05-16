import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

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
import { performCompLookup } from '@/lib/layer2/lookup/performLookup';
import type { RawComp } from '@/lib/layer2/types';

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
  return new Request('http://localhost/api/comp/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('performCompLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2026-05-02T03:04:05.678Z') });
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
    persistCompsMock.mockRejectedValue(new Error('persistComps failure'));
    readCompsMock.mockResolvedValue({ comps: [], computedAt: null, isFresh: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches POST /api/comp/lookup JSON envelope for INSUFFICIENT_DATA + reference comps', async () => {
    const payload = { query: '2018 Panini Prizm Luka Silver', grade: 'PSA 10' };
    const direct = await performCompLookup(payload);
    expect(direct.ok).toBe(true);

    const res = await POST(jsonRequest(payload));
    expect(res.status).toBe(200);
    const viaHttp = await res.json();

    expect(viaHttp).toEqual(direct.ok ? direct.data : undefined);
  });
});
