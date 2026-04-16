import { XMLParser } from 'fast-xml-parser';
import { extractItemSpecificsFromItem } from './itemSpecifics';

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function tradingGetItemSpecifics(args: {
  accessToken: string;
  itemId: string;
}): Promise<Record<string, string>> {
  const endpoint = 'https://api.ebay.com/ws/api.dll';
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${escapeXml(args.itemId)}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'text/xml',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-IAF-TOKEN': args.accessToken,
    },
    body: xml,
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`eBay GetItem failed (${res.status}).`);

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const parsed = parser.parse(text) as any;
  const root =
    parsed?.GetItemResponse ??
    parsed?.['ns2:GetItemResponse'] ??
    parsed?.GetItemResponseType ??
    parsed;

  const ack = root?.Ack;
  if (ack && String(ack).toLowerCase() !== 'success' && String(ack).toLowerCase() !== 'warning') {
    const err = asArray(root?.Errors);
    const msg =
      err?.[0]?.LongMessage ??
      err?.[0]?.ShortMessage ??
      root?.Errors?.LongMessage ??
      root?.Errors?.ShortMessage ??
      'eBay GetItem error.';
    throw new Error(String(msg));
  }

  const item = root?.Item ?? null;
  const specifics = extractItemSpecificsFromItem(item);
  return specifics;
}

export async function tradingGetItem(args: {
  accessToken: string;
  itemId: string;
}): Promise<{
  title: string | null;
  imageUrl: string | null;
  itemSpecifics: Record<string, string>;
  purchase: {
    purchase_date: string | null;
    purchase_price_cents: number | null;
    taxes_cents: number | null;
    shipping_cents: number | null;
    total_cost_cents: number | null;
    currency: string | null;
  };
}> {
  const endpoint = 'https://api.ebay.com/ws/api.dll';
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${escapeXml(args.itemId)}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'text/xml',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-IAF-TOKEN': args.accessToken,
    },
    body: xml,
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`eBay GetItem failed (${res.status}).`);

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const parsed = parser.parse(text) as any;
  const root =
    parsed?.GetItemResponse ??
    parsed?.['ns2:GetItemResponse'] ??
    parsed?.GetItemResponseType ??
    parsed;

  const ack = root?.Ack;
  if (ack && String(ack).toLowerCase() !== 'success' && String(ack).toLowerCase() !== 'warning') {
    const err = asArray(root?.Errors);
    const msg =
      err?.[0]?.LongMessage ??
      err?.[0]?.ShortMessage ??
      root?.Errors?.LongMessage ??
      root?.Errors?.ShortMessage ??
      'eBay GetItem error.';
    throw new Error(String(msg));
  }

  const item = root?.Item ?? null;
  const title = item?.Title != null ? String(item.Title) : null;
  const imageUrl =
    item?.PictureDetails?.GalleryURL != null
      ? String(Array.isArray(item.PictureDetails.GalleryURL) ? item.PictureDetails.GalleryURL[0] : item.PictureDetails.GalleryURL)
      : item?.PictureDetails?.PictureURL != null
        ? String(Array.isArray(item.PictureDetails.PictureURL) ? item.PictureDetails.PictureURL[0] : item.PictureDetails.PictureURL)
        : null;

  const currentPrice = parseTradingMoney(item?.SellingStatus?.CurrentPrice ?? null);
  const shipping = parseTradingMoney(item?.ShippingDetails?.ShippingServiceOptions?.ShippingServiceCost ?? null);
  const currency = currentPrice?.currency ?? shipping?.currency ?? null;
  const purchase_price_cents = currentPrice?.cents ?? null;
  const shipping_cents = shipping?.cents ?? null;
  const total_cost_cents = purchase_price_cents != null ? purchase_price_cents + (shipping_cents ?? 0) : null;

  return {
    title,
    imageUrl,
    itemSpecifics: extractItemSpecificsFromItem(item),
    purchase: {
      purchase_date: null,
      purchase_price_cents,
      taxes_cents: null,
      shipping_cents,
      total_cost_cents,
      currency,
    },
  };
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseTradingMoney(v: unknown): { cents: number; currency: string | null } | null {
  if (!v) return null;
  // Trading API money can be like: { currencyID: "USD", "#text": "12.34" } or a string/number.
  if (typeof v === 'string' || typeof v === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return { cents: Math.round(n * 100), currency: null };
  }
  if (typeof v === 'object') {
    const obj = v as any;
    const raw = obj['#text'] ?? obj.value ?? obj.Value ?? obj.amount ?? null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const currency = obj.currencyID != null ? String(obj.currencyID) : obj.currency != null ? String(obj.currency) : null;
    return { cents: Math.round(n * 100), currency };
  }
  return null;
}

