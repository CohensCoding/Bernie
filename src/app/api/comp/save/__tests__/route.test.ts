import { describe, expect, it, vi, beforeEach } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/cards', () => ({
  createCardWithPurchase: createMock,
}));

import { POST } from '@/app/api/comp/save/route';

function req(body: unknown) {
  return new Request('http://localhost/api/comp/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/comp/save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ cardId: 'c-test' });
  });

  it('returns cardId + redirectUrl on success', async () => {
    const res = await POST(
      req({
        canonicalCardId: 'abc',
        identity: {
          player: 'Wayne Gretzky',
          year: 1979,
          setName: 'OPC',
          grader: 'PSA',
          grade: '8',
        },
        purchase: { pricePaidCents: 12_345, purchaseDate: '2026-05-10' },
      }),
    );

    expect(res.status).toBe(200);
    const j = (await res.json()) as { cardId: string; redirectUrl: string };
    expect(j).toEqual({ cardId: 'c-test', redirectUrl: '/cards/c-test' });
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0]![0] as {
      canonicalCardId: string;
      purchase: { pricePaidCents: number };
    };
    expect(arg.canonicalCardId).toBe('abc');
    expect(arg.purchase.pricePaidCents).toBe(12_345);
  });

  it('returns 400 for invalid ISO purchaseDate', async () => {
    const res = await POST(
      req({
        canonicalCardId: 'x',
        identity: { player: 'P', year: 2020, setName: 'S', grader: 'RAW', grade: 'NM' },
        purchase: { pricePaidCents: 100, purchaseDate: 'bad-date' },
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });
});
