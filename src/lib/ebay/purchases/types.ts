export type EbayPurchase = {
  id: string; // stable unique key for dedupe + routing
  source: 'ebay';
  title: string;
  purchasedAt: string | null; // ISO date YYYY-MM-DD when possible
  totalCostCents: number;
  currency: string | null;
  imageUrl: string | null;
  external: {
    orderId?: string | null;
    transactionId?: string | null;
    itemId?: string | null;
    listingUrl?: string | null;
  };
  raw: unknown;
};

export type EbayPurchaseProvider = {
  /** `days` is clamped to at most 30 for Trading `GetOrders` `NumberOfDays`. */
  listRecentPurchases: (args: { accessToken: string; days: number }) => Promise<EbayPurchase[]>;
};

