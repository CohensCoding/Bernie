import { XMLParser } from 'fast-xml-parser';
import { EBAY_GET_ORDERS_MAX_DAYS } from './constants';
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
          const title = t?.Item?.Title ?? o?.OrderLineItemID ?? 'eBay purchase';
          const itemId = t?.Item?.ItemID ?? null;
          const transactionId = t?.TransactionID ?? null;
          const listingUrl = t?.Item?.ListingDetails?.ViewItemURL ?? null;
          const pictureUrl =
            t?.Item?.PictureDetails?.GalleryURL ??
            t?.Item?.PictureDetails?.PictureURL ??
            t?.Item?.GalleryURL ??
            null;

          const paid = t?.ActualShippingCost ?? t?.TransactionPrice ?? o?.Total ?? 0;
          const total = centsFromMoney(o?.Total ?? paid);
          const currency = o?.Total?.currencyID ?? paid?.currencyID ?? null;
          const purchasedAt = safeDate(o?.CreatedTime ?? t?.CreatedDate ?? null);

          const externalId = [orderId, transactionId].filter(Boolean).join(':') || String(itemId ?? title);
          out.push({
            id: `ebay:${externalId}`,
            source: 'ebay',
            title: String(title),
            purchasedAt,
            totalCostCents: total,
            currency: currency ? String(currency) : null,
            imageUrl: pictureUrl ? String(pictureUrl) : null,
            external: { orderId, transactionId, itemId, listingUrl },
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

