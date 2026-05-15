import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  compDedupeKey,
  mergeDbCompsWithFanoutFallback,
  persistComps,
  rawCompsToMemoryComps,
} from '@/lib/layer2/cache/comps';
import type { Comp, RawComp } from '@/lib/layer2/types';

function mockSupabaseForPersist(opts: { upsertError?: { message: string } | null; insertError?: { message: string } | null }) {
  const upsert = vi.fn().mockResolvedValue({ error: opts.upsertError ?? null });
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
  const from = vi.fn().mockReturnValue({ upsert, insert });
  return { client: { from } as unknown as SupabaseClient, upsert, insert, from };
}

describe('persistComps', () => {
  it('inserts rows without listing id (never calls upsert for those)', async () => {
    const { client, upsert, insert } = mockSupabaseForPersist({});
    const raw: RawComp[] = [
      {
        source: 'ebay_scrape',
        sourceListingId: null,
        grader: 'PSA',
        grade: '10',
        salePriceCents: 100,
        saleDate: '2026-01-15',
        saleType: 'unknown',
        listingUrl: null,
      },
      {
        source: 'ebay_scrape',
        sourceListingId: null,
        grader: 'PSA',
        grade: '10',
        salePriceCents: 200,
        saleDate: '2026-01-16',
        saleType: 'unknown',
        listingUrl: null,
      },
    ];
    const { inserted } = await persistComps({ supabase: client, canonicalCardId: 'c1', rawComps: raw });
    expect(inserted).toBe(2);
    expect(upsert).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    const insertedRows = insert.mock.calls[0]![0] as { source_listing_id: null }[];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows.every((r) => r.source_listing_id === null)).toBe(true);
  });

  it('upserts rows with listing id (never calls insert for those)', async () => {
    const { client, upsert, insert } = mockSupabaseForPersist({});
    const raw: RawComp[] = [
      {
        source: 'ebay_browse',
        sourceListingId: 'v1|1|0',
        grader: 'PSA',
        grade: '10',
        salePriceCents: 1500_00,
        saleDate: '2026-05-13',
        saleType: 'active_listing',
        listingUrl: 'https://ebay.com/itm/1',
      },
    ];
    const { inserted } = await persistComps({ supabase: client, canonicalCardId: 'c1', rawComps: raw });
    expect(inserted).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'ebay_browse',
          source_listing_id: 'v1|1|0',
          canonical_card_id: 'c1',
        }),
      ]),
      { onConflict: 'source,source_listing_id' },
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('runs upsert for listed rows and insert for unlisted rows in one batch', async () => {
    const { client, upsert, insert } = mockSupabaseForPersist({});
    const raw: RawComp[] = [
      {
        source: 'ebay_browse',
        sourceListingId: 'v1|1|0',
        grader: 'PSA',
        grade: '10',
        salePriceCents: 100,
        saleDate: '2026-05-13',
        saleType: 'active_listing',
        listingUrl: null,
      },
      {
        source: 'ebay_scrape',
        sourceListingId: null,
        grader: 'PSA',
        grade: '10',
        salePriceCents: 200,
        saleDate: '2026-05-13',
        saleType: 'unknown',
        listingUrl: null,
      },
    ];
    await persistComps({ supabase: client, canonicalCardId: 'c1', rawComps: raw });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('calling persist twice with the same listing id hits upsert twice (server-side dedupe)', async () => {
    const { client, upsert } = mockSupabaseForPersist({});
    const raw: RawComp[] = [
      {
        source: 'ebay_browse',
        sourceListingId: 'v1|same|0',
        grader: 'PSA',
        grade: '10',
        salePriceCents: 100,
        saleDate: '2026-05-13',
        saleType: 'active_listing',
        listingUrl: null,
      },
    ];
    await persistComps({ supabase: client, canonicalCardId: 'c1', rawComps: raw });
    await persistComps({ supabase: client, canonicalCardId: 'c1', rawComps: raw });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('throws when upsert fails', async () => {
    const { client } = mockSupabaseForPersist({ upsertError: { message: 'ON CONFLICT oops' } });
    const raw: RawComp[] = [
      {
        source: 'ebay_browse',
        sourceListingId: 'v1|1|0',
        grader: 'PSA',
        grade: '10',
        salePriceCents: 100,
        saleDate: '2026-05-13',
        saleType: 'active_listing',
        listingUrl: null,
      },
    ];
    await expect(persistComps({ supabase: client, canonicalCardId: 'c1', rawComps: raw })).rejects.toThrow(
      /persistComps \(upsert with listing\)/,
    );
  });
});

describe('rawCompsToMemoryComps & mergeDbCompsWithFanoutFallback', () => {
  it('assigns mem ids and preserves fields', () => {
    const raw: RawComp[] = [
      {
        source: 'ebay_browse',
        sourceListingId: 'v1|7|0',
        grader: 'PSA',
        grade: '10',
        salePriceCents: 99,
        saleDate: '2026-05-13',
        saleType: 'active_listing',
        listingUrl: 'https://x',
      },
    ];
    const m = rawCompsToMemoryComps('can-x', raw);
    expect(m[0]!.id).toBe('mem:ebay_browse:v1|7|0');
    expect(m[0]!.canonicalCardId).toBe('can-x');
    expect(m[0]!.fetchedAt).toMatch(/^\d{4}-/);
  });

  it('null listing ids get distinct mem ids per index', () => {
    const raw: RawComp[] = [
      {
        source: 'ebay_scrape',
        sourceListingId: null,
        grader: 'PSA',
        grade: '10',
        salePriceCents: 1,
        saleDate: '2026-05-13',
        saleType: 'unknown',
        listingUrl: null,
      },
      {
        source: 'ebay_scrape',
        sourceListingId: null,
        grader: 'PSA',
        grade: '10',
        salePriceCents: 2,
        saleDate: '2026-05-13',
        saleType: 'unknown',
        listingUrl: null,
      },
    ];
    const m = rawCompsToMemoryComps('can-x', raw);
    expect(m[0]!.id).not.toBe(m[1]!.id);
  });

  it('merge lets in-memory win for same (source, listingId)', () => {
    const raw: RawComp[] = [
      {
        source: 'ebay_browse',
        sourceListingId: 'v1|1|0',
        grader: 'PSA',
        grade: '10',
        salePriceCents: 999,
        saleDate: '2026-05-13',
        saleType: 'active_listing',
        listingUrl: null,
      },
    ];
    const dbComp: Comp = {
      id: 'uuid-db',
      canonicalCardId: 'can-x',
      source: 'ebay_browse',
      sourceListingId: 'v1|1|0',
      grader: 'PSA',
      grade: '10',
      salePriceCents: 100,
      saleDate: '2026-01-01',
      saleType: 'active_listing',
      listingUrl: null,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    };
    const merged = mergeDbCompsWithFanoutFallback([dbComp], 'can-x', raw);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.salePriceCents).toBe(999);
    expect(merged[0]!.id.startsWith('mem:')).toBe(true);
  });

  it('compDedupeKey returns null for missing listing id', () => {
    expect(compDedupeKey({ source: 'ebay_scrape', sourceListingId: null })).toBeNull();
    expect(compDedupeKey({ source: 'ebay_browse', sourceListingId: 'x' })).toBe('ebay_browse\0x');
  });
});
