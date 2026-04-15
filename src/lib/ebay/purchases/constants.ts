/**
 * eBay Trading `GetOrders` `NumberOfDays` maximum (API rejects larger windows).
 * For a longer history, chunk multiple 30-day requests (not implemented in MVP).
 */
export const EBAY_GET_ORDERS_MAX_DAYS = 30;
