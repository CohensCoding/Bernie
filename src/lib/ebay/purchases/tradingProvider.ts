import { XMLParser } from 'fast-xml-parser';
import { EBAY_GET_ORDERS_MAX_DAYS } from './constants';
import { extractItemSpecificsFromItem } from './itemSpecifics';
import type { EbayPurchase, EbayPurchaseProvider } from './types';

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function safeDate(dateTime: string | undefined | null): string | null {
  if (!dateTime) return null;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function centsFromMoney(v: any): number {
  // Trading API money can be { value: "12.34", currencyID: "USD" } or string.
  const num = Number(typeof v === 'string' ? v : v?.value ?? v?.Value ?? v ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * eBay AmountType in XML often parses as `{ currencyID: "USD", "#text": "12.34" }` (fast-xml-parser).
 * Older shapes used `value` / `Value`.
 */
function moneyCentsAndCurrency(v: unknown): { cents: number; currency: string | null } {
  if (v == null || v === '') return { cents: 0, currency: null };

  const fromObject = (o: Record<string, unknown>): { cents: number; currency: string | null } => {
    const raw =
      o['#text'] ??
      o['_'] ??
      o.value ??
      o.Value ??
      (typeof (o as any)[0] === 'string' || typeof (o as any)[0] === 'number' ? (o as any)[0] : null);
    const cur = (o.currencyID ?? (o as any)['@_currencyID'] ?? o.Currency ?? null) as string | null;
    if (raw == null) return { cents: 0, currency: cur ? String(cur) : null };
    const cents = centsFromMoney(typeof raw === 'number' ? String(raw) : raw);
    return { cents, currency: cur ? String(cur) : null };
  };

  if (typeof v === 'string' || typeof v === 'number') {
    return { cents: centsFromMoney(v), currency: null };
  }
  if (Array.isArray(v)) {
    for (const el of v) {
      const r = moneyCentsAndCurrency(el);
      if (r.cents > 0) return r;
    }
    return { cents: 0, currency: null };
  }
  if (typeof v === 'object') return fromObject(v as Record<string, unknown>);
  return { cents: 0, currency: null };
}

function firstLineItemCents(
  t: Record<string, unknown>,
  o: Record<string, unknown>,
): { cents: number; currency: string | null } {
  const item = t.Item as Record<string, unknown> | undefined;
  const selling = item?.SellingStatus as Record<string, unknown> | undefined;
  const tries = [
    t.TransactionPrice,
    t.ConvertedTransactionPrice,
    t.AmountPaid,
    selling?.CurrentPrice,
    o.Total,
    o.AmountPaid,
    o.Subtotal,
    o.TotalCost,
  ];
  for (const cand of tries) {
    const r = moneyCentsAndCurrency(cand);
    if (r.cents > 0) return r;
  }
  return { cents: 0, currency: null };
}

function firstImageUrl(t: Record<string, unknown>): string | null {
  const item = t.Item as Record<string, unknown> | undefined;
  if (!item) return null;
  const pd = item.PictureDetails as Record<string, unknown> | undefined;
  if (!pd) return null;
  const gallery = pd.GalleryURL;
  if (gallery) {
    const g = Array.isArray(gallery) ? gallery[0] : gallery;
    if (g) return String(g);
  }
  const pic = pd.PictureURL;
  if (!pic) return null;
  if (Array.isArray(pic)) return pic.length ? String(pic[0]) : null;
  return String(pic);
}

export function tradingGetOrdersProvider(): EbayPurchaseProvider {
  return {
    async listRecentPurchases({ accessToken, days }) {
      const endpoint = 'https://api.ebay.com/ws/api.dll';
      const windowDays = Math.max(1, Math.min(EBAY_GET_ORDERS_MAX_DAYS, days));
      const xml = `<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<GetOrdersRequest xmlns=\"urn:ebay:apis:eBLBaseComponents\">\n  <OrderRole>Buyer</OrderRole>\n  <NumberOfDays>${windowDays}</NumberOfDays>\n  <OrderStatus>Completed</OrderStatus>\n  <Pagination>\n    <EntriesPerPage>50</EntriesPerPage>\n    <PageNumber>1</PageNumber>\n  </Pagination>\n</GetOrdersRequest>`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'text/xml',
          'X-EBAY-API-CALL-NAME': 'GetOrders',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-IAF-TOKEN': accessToken,
        },
        body: xml,
        cache: 'no-store',
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`eBay GetOrders failed (${res.status}).`);

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const parsed = parser.parse(text) as any;
      const root =
        parsed?.GetOrdersResponse ??
        parsed?.['ns2:GetOrdersResponse'] ??
        parsed?.GetOrdersResponseType ??
        parsed;

      const ack = root?.Ack;
      if (ack && String(ack).toLowerCase() !== 'success' && String(ack).toLowerCase() !== 'warning') {
        const msg = root?.Errors?.LongMessage ?? root?.Errors?.ShortMessage ?? 'eBay error.';
        throw new Error(String(msg));
      }

      const orders = asArray(root?.OrderArray?.Order);
      const out: EbayPurchase[] = [];

      for (const o of orders) {
        const orderId = o?.OrderID ?? null;
        const txs = asArray(o?.TransactionArray?.Transaction);
        for (const t of txs) {
          const tx = t as Record<string, unknown>;
          const ord = o as Record<string, unknown>;
          const title = (tx?.Item as any)?.Title ?? ord?.OrderLineItemID ?? 'eBay purchase';
          const itemId = (tx?.Item as any)?.ItemID ?? null;
          const transactionId = tx?.TransactionID ?? null;
          const listingUrlRaw = (tx.Item as Record<string, unknown> | undefined)?.ListingDetails as
            | Record<string, unknown>
            | undefined;
          const listingUrl = listingUrlRaw?.ViewItemURL != null ? String(listingUrlRaw.ViewItemURL) : null;

          const pictureUrl = firstImageUrl(tx);

          const { cents: total, currency } = firstLineItemCents(tx, ord);
          const purchasedAt = safeDate(
            (ord.CreatedTime as string | undefined) ?? (tx.CreatedDate as string | undefined) ?? null,
          );

          const oid = orderId != null ? String(orderId) : null;
          const tid = transactionId != null ? String(transactionId) : null;
          const iid = itemId != null ? String(itemId) : null;
          const externalId = [oid, tid].filter(Boolean).join(':') || String(title);
          const itemSpecifics = extractItemSpecificsFromItem(tx);
          out.push({
            id: `ebay:${externalId}`,
            source: 'ebay',
            title: String(title),
            purchasedAt,
            totalCostCents: total,
            currency: currency ? String(currency) : null,
            imageUrl: pictureUrl ? String(pictureUrl) : null,
            external: { orderId: oid, transactionId: tid, itemId: iid, listingUrl },
            ...(Object.keys(itemSpecifics).length ? { itemSpecifics } : {}),
            raw: { order: o, tx: t },
          });
        }
      }

      // newest first (best effort)
      out.sort((a, b) => String(b.purchasedAt ?? '').localeCompare(String(a.purchasedAt ?? '')));
      return out;
    },
  };
}

