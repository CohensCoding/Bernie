/**
 * eBay application-token auth for Layer 2 official APIs.
 *
 * Strategy:
 *   1. If `EBAY_OAUTH_TOKEN` is set explicitly, return it. This is the
 *      fast-path for dev and for envs that mint tokens out-of-band.
 *   2. Otherwise mint an *application* token via the `client_credentials`
 *      grant using `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET`. These are
 *      the same env vars Layer 1 uses for its user-token PKCE flow, but
 *      the grant type here is different: this is for accessing public
 *      catalog endpoints (Browse, Marketplace Insights), not the
 *      connected user's account data.
 *   3. Cache the minted token in module memory until ~60s before expiry.
 *
 * Sandbox is honored via `EBAY_ENV=sandbox` (matches Layer 1's
 * convention). Layer 2 makes no calls into Layer 1 modules; the env
 * vars are read directly so this file has no Layer 1 dependency.
 *
 * Reliability: errors here are never thrown to the orchestrator; they
 * are returned as `{ ok: false, reason }` so a bad eBay token cannot
 * crash the whole lookup. The 5s timeout + 1 retry policy from
 * `fetchWithRetry` applies to the token-mint call too.
 */

import { fetchWithRetry } from '@/lib/layer2/sources/http';

const PROD_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

const BROWSE_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const INSIGHTS_SCOPE = 'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights';

const SAFETY_MARGIN_MS = 60_000;

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cached: CachedToken | null = null;

function tokenUrl(): string {
  const env = (process.env.EBAY_ENV ?? '').trim().toLowerCase();
  return env === 'sandbox' ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL;
}

function basicAuthHeader(): string | null {
  const id = process.env.EBAY_CLIENT_ID?.trim();
  const secret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return 'Basic ' + Buffer.from(`${id}:${secret}`, 'utf8').toString('base64');
}

function desiredScope(): string {
  const insightsEnabled =
    (process.env.EBAY_MARKETPLACE_INSIGHTS_ENABLED ?? '').trim().toLowerCase() === 'true';
  // If Insights is enabled we request both scopes in one mint. If eBay
  // hasn't approved this app for Insights, the token endpoint either
  // returns an error (we fall back at the route layer by returning ok:
  // false) or returns a token with only the granted scopes — eBay will
  // 401/403 on Insights calls and the adapter falls back to Browse.
  return insightsEnabled ? `${BROWSE_SCOPE} ${INSIGHTS_SCOPE}` : BROWSE_SCOPE;
}

/** Test-only escape hatch. Production code never calls this. */
export function __resetEbayAuthCache(): void {
  cached = null;
}

export type EbayTokenResult =
  | { ok: true; token: string; source: 'static' | 'minted' | 'cache' }
  | { ok: false; reason: string };

export async function getEbayApplicationToken(): Promise<EbayTokenResult> {
  const staticToken = process.env.EBAY_OAUTH_TOKEN?.trim();
  if (staticToken && staticToken.length > 0) {
    return { ok: true, token: staticToken, source: 'static' };
  }

  const now = Date.now();
  if (cached && cached.expiresAtMs > now + SAFETY_MARGIN_MS) {
    return { ok: true, token: cached.accessToken, source: 'cache' };
  }

  const auth = basicAuthHeader();
  if (!auth) {
    return {
      ok: false,
      reason:
        'eBay auth unconfigured: set EBAY_OAUTH_TOKEN, or both EBAY_CLIENT_ID and EBAY_CLIENT_SECRET, in .env.local.',
    };
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('scope', desiredScope());

  let res: Response;
  try {
    res = await fetchWithRetry(tokenUrl(), {
      method: 'POST',
      headers: {
        authorization: auth,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, reason: `eBay token mint network error: ${msg}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 200);
    return {
      ok: false,
      reason: `eBay token endpoint HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`,
    };
  }

  let json: { access_token?: string; expires_in?: number; token_type?: string };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, reason: 'eBay token endpoint returned non-JSON body.' };
  }

  if (typeof json.access_token !== 'string' || typeof json.expires_in !== 'number') {
    return { ok: false, reason: 'eBay token endpoint returned malformed payload.' };
  }

  cached = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000,
  };
  return { ok: true, token: json.access_token, source: 'minted' };
}

export function hasAnyEbayCredentials(): boolean {
  const staticToken = process.env.EBAY_OAUTH_TOKEN?.trim();
  if (staticToken && staticToken.length > 0) return true;
  return basicAuthHeader() != null;
}
