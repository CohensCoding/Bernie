export type EbayUrlParseResult =
  | { ok: true; itemId: string; canonicalUrl: string }
  | { ok: false; error: string };

/**
 * Parse common eBay listing URLs and extract the numeric item id.
 * Supports desktop and many share/mobile variants.
 */
export function parseEbayListingUrl(input: string): EbayUrlParseResult {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, error: 'Missing URL.' };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // allow pasting without scheme
    try {
      url = new URL(`https://${raw}`);
    } catch {
      return { ok: false, error: 'Invalid URL.' };
    }
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes('ebay.')) return { ok: false, error: 'Not an eBay URL.' };

  // Path forms:
  // - /itm/<itemId>
  // - /itm/<title>/<itemId>
  const path = url.pathname;
  const m1 = /\/itm\/(\d{9,15})(?:[/?]|$)/i.exec(path);
  const m2 = /\/itm\/[^/]+\/(\d{9,15})(?:[/?]|$)/i.exec(path);

  // Query forms (share links sometimes include these)
  const q = url.searchParams;
  const cand =
    m1?.[1] ??
    m2?.[1] ??
    q.get('item') ??
    q.get('itemId') ??
    q.get('iid') ??
    q.get('ItemID');

  const itemId = (cand ?? '').replace(/\D/g, '');
  if (!itemId || itemId.length < 9) {
    return { ok: false, error: 'Unsupported eBay listing URL (missing item id).' };
  }

  return {
    ok: true,
    itemId,
    canonicalUrl: `https://www.ebay.com/itm/${itemId}`,
  };
}

