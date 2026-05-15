/**
 * Tests for the eBay official-API source adapter.
 *
 * Critical contract under test: when the adapter falls back to the
 * Browse API (because Marketplace Insights is disabled or unapproved),
 * every returned `RawComp` must be tagged
 *   - `source: 'ebay_browse'`
 *   - `saleType: 'active_listing'`
 * REGARDLESS of the underlying eBay listing's buying options. This
 * matters because the FMV pipeline filters on `source` first and treats
 * `active_listing` as zero-weight; tagging a Browse listing as
 * `'auction'` or `'bin'` would let it leak into FMV math.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ebaySource } from '@/lib/layer2/sources/ebay';
import { __resetEbayAuthCache } from '@/lib/layer2/sources/ebayAuth';
import type { CompQuery } from '@/lib/layer2/sources/types';

const QUERY: CompQuery = {
  canonicalId: 'panini-prizm-2018-280-luka-doncic-silver',
  player: 'Luka Doncic',
  year: 2018,
  setName: 'Panini Prizm',
  cardNumber: '280',
  parallel: 'Silver',
  grader: 'PSA',
  grade: '10',
  daysBack: 90,
};

function browseResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ itemSummaries: items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ebaySource — Browse fallback sale_type contract', () => {
  beforeEach(() => {
    vi.stubEnv('EBAY_OAUTH_TOKEN', 'test-token');
    vi.stubEnv('EBAY_MARKETPLACE_INSIGHTS_ENABLED', 'false');
    __resetEbayAuthCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    __resetEbayAuthCache();
  });

  it('tags every Browse result as active_listing regardless of underlying buying options', async () => {
    // Three listings: an active auction (bidCount > 0), a pure BIN, and
    // a BIN that also accepts best offers. Under any honest read of the
    // underlying listing type, these would map to 'auction', 'bin', and
    // 'bin' respectively — but they are ACTIVE LISTINGS, not sales, so
    // the adapter must collapse them all to 'active_listing'.
    const items = [
      {
        itemId: 'v1|111|0',
        itemWebUrl: 'https://www.ebay.com/itm/111',
        price: { value: '1200.00', currency: 'USD' },
        buyingOptions: ['AUCTION'],
        bidCount: 7,
      },
      {
        itemId: 'v1|222|0',
        itemWebUrl: 'https://www.ebay.com/itm/222',
        price: { value: '1300.00', currency: 'USD' },
        buyingOptions: ['FIXED_PRICE'],
      },
      {
        itemId: 'v1|333|0',
        itemWebUrl: 'https://www.ebay.com/itm/333',
        price: { value: '1400.00', currency: 'USD' },
        buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => browseResponse(items)),
    );

    const result = await ebaySource.fetchComps(QUERY);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.comps).toHaveLength(3);

    for (const c of result.comps) {
      expect(c.source).toBe('ebay_browse');
      expect(c.saleType).toBe('active_listing');
    }

    // Prices preserved in cents-integer form.
    expect(result.comps.map((c) => c.salePriceCents)).toEqual([120_000, 130_000, 140_000]);
    // Listing URLs preserved when present.
    expect(result.comps.map((c) => c.listingUrl)).toEqual([
      'https://www.ebay.com/itm/111',
      'https://www.ebay.com/itm/222',
      'https://www.ebay.com/itm/333',
    ]);
  });

  it('reports the adapter id as `ebay_marketplace_insights` while tagging individual rows `ebay_browse`', async () => {
    // The orchestrator groups by adapter id; individual rows carry the
    // narrower source. This invariant is what lets the route's
    // `sourceHealth` report eBay as a single bucket while the FMV
    // pipeline filters per-row.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        browseResponse([
          {
            itemId: 'v1|999|0',
            itemWebUrl: 'https://www.ebay.com/itm/999',
            price: { value: '500.00' },
            buyingOptions: ['FIXED_PRICE'],
          },
        ]),
      ),
    );

    const result = await ebaySource.fetchComps(QUERY);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.source).toBe('ebay_marketplace_insights');
    expect(result.comps[0]!.source).toBe('ebay_browse');
  });

  it('isAvailable() reflects any available credential path (static token OR client credentials)', () => {
    vi.stubEnv('EBAY_OAUTH_TOKEN', '');
    vi.stubEnv('EBAY_CLIENT_ID', '');
    vi.stubEnv('EBAY_CLIENT_SECRET', '');
    expect(ebaySource.isAvailable()).toBe(false);

    vi.stubEnv('EBAY_OAUTH_TOKEN', 'a-token');
    expect(ebaySource.isAvailable()).toBe(true);

    vi.stubEnv('EBAY_OAUTH_TOKEN', '');
    vi.stubEnv('EBAY_CLIENT_ID', 'id');
    vi.stubEnv('EBAY_CLIENT_SECRET', 'secret');
    expect(ebaySource.isAvailable()).toBe(true);
  });

  it('returns ok:false (no crash) when no credentials are configured', async () => {
    vi.stubEnv('EBAY_OAUTH_TOKEN', '');
    vi.stubEnv('EBAY_CLIENT_ID', '');
    vi.stubEnv('EBAY_CLIENT_SECRET', '');
    const result = await ebaySource.fetchComps(QUERY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toMatch(/eBay auth unconfigured/);
  });

  it('returns ok:false (no crash) when Browse responds non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );
    const result = await ebaySource.fetchComps(QUERY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toMatch(/Browse|HTTP/);
  });
});

describe('ebaySource — application token minting via client_credentials', () => {
  beforeEach(() => {
    // Force the mint path (no static token).
    vi.stubEnv('EBAY_OAUTH_TOKEN', '');
    vi.stubEnv('EBAY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('EBAY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('EBAY_MARKETPLACE_INSIGHTS_ENABLED', 'false');
    vi.stubEnv('EBAY_ENV', 'production');
    __resetEbayAuthCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    __resetEbayAuthCache();
  });

  it('mints an app token via client_credentials, then uses it on Browse', async () => {
    const mintedToken = 'minted-bearer-abc';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/identity/v1/oauth2/token')) {
        // Verify Basic auth header is constructed correctly.
        const auth = (init?.headers as Record<string, string>)['authorization'];
        const expected =
          'Basic ' +
          Buffer.from('test-client-id:test-client-secret', 'utf8').toString('base64');
        expect(auth).toBe(expected);
        // Verify grant + scope in body.
        const body = init?.body?.toString() ?? '';
        expect(body).toContain('grant_type=client_credentials');
        expect(body).toContain('scope=');
        return new Response(
          JSON.stringify({
            access_token: mintedToken,
            expires_in: 7200,
            token_type: 'Application Access Token',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://api.ebay.com/buy/browse/v1/item_summary/search')) {
        const auth = (init?.headers as Record<string, string>)['Authorization'];
        expect(auth).toBe(`Bearer ${mintedToken}`);
        return browseResponse([
          {
            itemId: 'v1|123|0',
            itemWebUrl: 'https://www.ebay.com/itm/123',
            price: { value: '550.00' },
            buyingOptions: ['FIXED_PRICE'],
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ebaySource.fetchComps(QUERY);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.comps).toHaveLength(1);
    expect(result.comps[0]!.saleType).toBe('active_listing');
    expect(result.comps[0]!.salePriceCents).toBe(55_000);

    // One token mint, one Browse call.
    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((u) => u.includes('/oauth2/token'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/buy/browse/'))).toHaveLength(1);
  });

  it('caches the minted token across consecutive fetchComps calls', async () => {
    const mintedToken = 'minted-cached';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/identity/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: mintedToken, expires_in: 7200 }),
          { status: 200 },
        );
      }
      return browseResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    await ebaySource.fetchComps(QUERY);
    await ebaySource.fetchComps(QUERY);
    await ebaySource.fetchComps(QUERY);

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((u) => u.includes('/oauth2/token'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/buy/browse/'))).toHaveLength(3);
  });

  it('returns ok:false when the token endpoint rejects the credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/identity/v1/oauth2/token')) {
          return new Response('{"error":"invalid_client"}', { status: 401 });
        }
        throw new Error('Browse should not have been called');
      }),
    );

    const result = await ebaySource.fetchComps(QUERY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toMatch(/eBay token endpoint HTTP 401/);
    expect(result.reason).toContain('invalid_client');
  });

  it('uses the sandbox token endpoint when EBAY_ENV=sandbox', async () => {
    vi.stubEnv('EBAY_ENV', 'sandbox');
    let mintHost = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/identity/v1/oauth2/token')) {
          mintHost = new URL(url).host;
          return new Response(
            JSON.stringify({ access_token: 't', expires_in: 100 }),
            { status: 200 },
          );
        }
        return browseResponse([]);
      }),
    );
    await ebaySource.fetchComps(QUERY);
    expect(mintHost).toBe('api.sandbox.ebay.com');
  });

  it('includes the Marketplace Insights scope when EBAY_MARKETPLACE_INSIGHTS_ENABLED=true', async () => {
    vi.stubEnv('EBAY_MARKETPLACE_INSIGHTS_ENABLED', 'true');
    let scopeSeen = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/identity/v1/oauth2/token')) {
          scopeSeen = String(init?.body ?? '');
          return new Response(
            JSON.stringify({ access_token: 't', expires_in: 100 }),
            { status: 200 },
          );
        }
        if (url.includes('/buy/marketplace_insights/')) {
          return new Response(JSON.stringify({ itemSales: [] }), { status: 200 });
        }
        return browseResponse([]);
      }),
    );
    await ebaySource.fetchComps(QUERY);
    expect(scopeSeen).toContain(
      encodeURIComponent('https://api.ebay.com/oauth/api_scope/buy.marketplace.insights'),
    );
  });
});
