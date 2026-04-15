import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEbayConnection } from '@/lib/ebay/connection';
import { getValidEbayAccessToken } from '@/lib/ebay/token';
import { tradingGetOrdersProvider } from '@/lib/ebay/purchases/tradingProvider';

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(90),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ days: url.searchParams.get('days') ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query.' }, { status: 400 });

    const conn = await getEbayConnection();
    if (!conn) return NextResponse.json({ error: 'eBay not connected.' }, { status: 401 });

    const access = await getValidEbayAccessToken();
    const provider = tradingGetOrdersProvider(); // behind interface; can swap later
    const purchases = await provider.listRecentPurchases({ accessToken: access, days: parsed.data.days });

    return NextResponse.json({ ok: true, purchases });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

