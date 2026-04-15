import { getEbayConnection, upsertEbayConnection } from '@/lib/ebay/connection';
import { refreshAccessToken } from '@/lib/ebay/oauth';

export async function getValidEbayAccessToken(): Promise<string> {
  const conn = await getEbayConnection();
  if (!conn) throw new Error('eBay is not connected.');

  const now = Date.now();
  const expMs = conn.expires_at ? Date.parse(conn.expires_at) : 0;

  if (conn.access_token && expMs && expMs - now > 60_000) return conn.access_token;

  // Refresh (always preferred when close to expiry or missing access token).
  const refreshed = await refreshAccessToken({ refresh_token: conn.refresh_token });
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await upsertEbayConnection({
    access_token: refreshed.access_token,
    refresh_token: conn.refresh_token,
    scopes: conn.scopes,
    expires_at: expiresAt,
  });
  return refreshed.access_token;
}

