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

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

