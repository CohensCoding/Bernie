import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockClient = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: () => mockClient.value as import('@supabase/supabase-js').SupabaseClient,
}));

import { createCardWithPurchase } from '@/lib/db/cards';

function attachSupabaseMock(opts: {
  cardSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
  txSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
  linkUpsert: () => Promise<{ error: Error | null }>;
  deleteEq?: () => Promise<{ error: Error | null }>;
}) {
  const deleteEqSpy = opts.deleteEq ?? vi.fn().mockResolvedValue({ error: null });

  const stub = {
    from(table: string) {
      if (table === 'cards') {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: async () => {
                    stub.__lastCardsInsertPayload = payload;
                    return opts.cardSingle();
                  },
                };
              },
            };
          },
          delete() {
            return { eq: deleteEqSpy };
          },
        };
      }
      if (table === 'card_transactions') {
        return {
          insert(payload: Record<string, unknown>) {
            stub.__lastTxInsertPayload = payload;
            return {
              select() {
                return {
                  single: opts.txSingle,
                };
              },
            };
          },
        };
      }
      if (table === 'card_canonical_links') {
        return {
          upsert(payload: Record<string, unknown>, options: Record<string, unknown>) {
            stub.__lastLinkPayload = payload;
            stub.__lastLinkOptions = options;
            return opts.linkUpsert();
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    __lastCardsInsertPayload: {} as Record<string, unknown>,
    __lastTxInsertPayload: {} as Record<string, unknown>,
    __lastLinkPayload: {} as Record<string, unknown>,
    __lastLinkOptions: {} as Record<string, unknown>,
  };

  mockClient.value = stub as unknown as typeof mockClient.value;
  return stub as typeof stub & { deleteEq: typeof deleteEqSpy };
}

describe('createCardWithPurchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseArgs = {
    canonicalCardId: 'canon-1',
    identity: {
      player: 'Luka Dončić',
      year: 2018,
      setName: 'Panini Prizm',
      cardNumber: '280',
      parallel: 'Silver',
      grader: 'PSA',
      grade: '10',
    },
    purchase: {
      pricePaidCents: 100_25,
      purchaseDate: '2026-05-16',
      notes: 'national',
    },
  } satisfies Parameters<typeof createCardWithPurchase>[0];

  it('creates portfolio rows + canonical link upsert payload', async () => {
    const stub = attachSupabaseMock({
      cardSingle: vi.fn().mockResolvedValue({ data: { id: 'CID' }, error: null }),
      txSingle: vi.fn().mockResolvedValue({ data: { id: 'TID' }, error: null }),
      linkUpsert: vi.fn().mockResolvedValue({ error: null }),
    });

    await expect(createCardWithPurchase(baseArgs)).resolves.toEqual({ cardId: 'CID' });

    expect(stub.__lastCardsInsertPayload).toMatchObject({
      graded: true,
      grading_company: 'PSA',
      grade: '10',
      year: 2018,
      set_name: 'Panini Prizm',
      player_name: 'Luka Dončić',
      parallel: 'Silver',
      card_number: '280',
    });

    expect(stub.__lastTxInsertPayload).toMatchObject({
      purchase_price_cents: 100_25,
      total_cost_cents: 100_25,
      purchase_date: '2026-05-16',
      platform: 'comp_lookup',
      notes: 'national',
    });

    expect(stub.__lastLinkPayload).toMatchObject({
      canonical_card_id: 'canon-1',
      linked_by: 'user_manual',
      card_id: 'CID',
    });
  });

  it('on downstream failure deletes the card row (cascade wipes tx)', async () => {
    const deleteSpy = vi.fn().mockResolvedValue({ error: null });
    attachSupabaseMock({
      cardSingle: vi.fn().mockResolvedValue({ data: { id: 'CID2' }, error: null }),
      txSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('tx boom') }),
      linkUpsert: vi.fn().mockResolvedValue({ error: null }),
      deleteEq: deleteSpy,
    });

    await expect(createCardWithPurchase(baseArgs)).rejects.toThrow(/card_transactions/u);
    expect(deleteSpy).toHaveBeenCalledWith('id', 'CID2');
  });
});
