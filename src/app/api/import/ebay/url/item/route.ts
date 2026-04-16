import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEbayConnection } from '@/lib/ebay/connection';
import { getValidEbayAccessToken } from '@/lib/ebay/token';
import { tradingGetItem } from '@/lib/ebay/purchases/tradingGetItem';

const QuerySchema = z.object({
  itemId: z.string().regex(/^\d{9,15}$/),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ itemId: url.searchParams.get('itemId') ?? '' });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });

    const itemId = parsed.data.itemId;
    const canonicalUrl = `https://www.ebay.com/itm/${itemId}`;

    // Prefer authenticated Trading lookup when connected.
    const conn = await getEbayConnection();
    if (conn) {
      const accessToken = await getValidEbayAccessToken();
      const item = await tradingGetItem({ accessToken, itemId });
      return NextResponse.json({
        ok: true,
        listing: {
          source: 'ebay',
          itemId,
          listingUrl: canonicalUrl,
          title: item.title,
          imageUrl: item.imageUrl,
          itemSpecifics: item.itemSpecifics,
          purchase: item.purchase,
        },
      });
    }

    // Public fallback (best effort). eBay may block automated requests; return a clear message.
    const res = await fetch(canonicalUrl, {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Unable to fetch listing. Connect eBay for reliable import.' },
        { status: 502 },
      );
    }
    if (/Pardon Our Interruption/i.test(text) || /Checking your browser/i.test(text)) {
      return NextResponse.json(
        { error: 'eBay blocked public access. Connect eBay for reliable import.' },
        { status: 403 },
      );
    }

    // Lightweight extraction: title from <title> and JSON-ish key features where present.
    const title = extractHtmlTitle(text);
    const itemSpecifics = extractSimpleAboutThisProduct(text);
    const price = extractPriceCents(text);
    const shipping = extractShippingCents(text);

    return NextResponse.json({
      ok: true,
      listing: {
        source: 'ebay',
        itemId,
        listingUrl: canonicalUrl,
        title,
        imageUrl: null,
        itemSpecifics,
        purchase: {
          purchase_date: null,
          purchase_price_cents: price,
          taxes_cents: 0,
          shipping_cents: shipping,
          total_cost_cents: price != null ? price + (shipping ?? 0) : null,
          currency: 'USD',
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function extractHtmlTitle(html: string): string | null {
  const m = /<title>([^<]{3,200})<\/title>/i.exec(html);
  if (!m) return null;
  const t = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  // eBay commonly has suffixes like \"| eBay\".
  return t.replace(/\s*\|\s*eBay\s*$/i, '').trim() || null;
}

function extractSimpleAboutThisProduct(html: string): Record<string, string> {
  // Very conservative fallback: try to find \"SportBaseball\" style key/value blocks
  // from the product attributes section which often renders as plain text in SSR fetch.
  const out: Record<string, string> = {};
  const lines = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?=Sport|League|Set|Team|Player\/Athlete|Card Number|Manufacturer|Season)/g);
  for (const chunk of lines) {
    const m = /\b(Sport|League|Set|Team|Player\/Athlete|Card Number|Manufacturer|Season)\s*([A-Za-z0-9][^]{0,60})/i.exec(
      chunk,
    );
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (k && v && v.length <= 64) out[k] = v;
  }
  return out;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractPriceCents(html: string): number | null {
  const m = /\bPrice:\s*\$([0-9][0-9,]*\.[0-9]{2})\b/i.exec(html);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function extractShippingCents(html: string): number | null {
  const m = /\bdelivery\b[^$]{0,80}\$([0-9][0-9,]*\.[0-9]{2})/i.exec(html);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

