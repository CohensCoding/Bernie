import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getValidEbayAccessToken } from '@/lib/ebay/token';
import { EBAY_GET_ORDERS_MAX_DAYS } from '@/lib/ebay/purchases/constants';
import { hasUsableItemSpecifics } from '@/lib/ebay/purchases/itemSpecifics';
import { tradingGetItemSpecifics } from '@/lib/ebay/purchases/tradingGetItem';
import { tradingGetOrdersProvider } from '@/lib/ebay/purchases/tradingProvider';

const QuerySchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ id: url.searchParams.get('id') ?? '' });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query.' }, { status: 400 });

    const access = await getValidEbayAccessToken();
    const provider = tradingGetOrdersProvider();
    const list = await provider.listRecentPurchases({ accessToken: access, days: EBAY_GET_ORDERS_MAX_DAYS });
    const found = list.find((p) => p.id === parsed.data.id) ?? null;
    if (!found) return NextResponse.json({ error: 'Purchase not found.' }, { status: 404 });

    // Structured-first enrichment: GetOrders does not always include ItemSpecifics.
    // If important fields are missing, do a follow-up GetItem lookup by itemId.
    const needsEnrichment = shouldEnrichSpecifics(found.itemSpecifics);
    const itemId = found.external?.itemId ?? null;
    if (needsEnrichment && itemId) {
      try {
        const fetched = await tradingGetItemSpecifics({ accessToken: access, itemId: String(itemId) });
        const merged = {
          ...(fetched ?? {}),
          ...(found.itemSpecifics ?? {}),
        };
        return NextResponse.json({
          ok: true,
          purchase: { ...found, ...(Object.keys(merged).length ? { itemSpecifics: merged } : {}) },
        });
      } catch {
        // best-effort: fall back to original purchase data
      }
    }

    return NextResponse.json({ ok: true, purchase: found });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function shouldEnrichSpecifics(itemSpecifics?: Record<string, string> | null): boolean {
  if (!hasUsableItemSpecifics(itemSpecifics)) return true;
  const get = (k: string) => {
    const v = itemSpecifics?.[k];
    return v != null && String(v).trim() ? String(v).trim() : null;
  };
  // If these are missing, this materially impacts trust.
  return !get('Sport') || !get('Team') || !get('Player/Athlete') || !get('Set');
}

