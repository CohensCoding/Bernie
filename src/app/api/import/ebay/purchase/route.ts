import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getValidEbayAccessToken } from '@/lib/ebay/token';
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
    const list = await provider.listRecentPurchases({ accessToken: access, days: 90 });
    const found = list.find((p) => p.id === parsed.data.id) ?? null;
    if (!found) return NextResponse.json({ error: 'Purchase not found.' }, { status: 404 });

    return NextResponse.json({ ok: true, purchase: found });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

