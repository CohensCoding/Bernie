import crypto from 'node:crypto';
import { getEbayEnv } from './env';

export function ebayBaseUrl() {
  const env = getEbayEnv();
  return env.EBAY_ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

export function ebayAuthUrl() {
  return 'https://auth.ebay.com/oauth2/authorize';
}

export function ebayTokenUrl() {
  return `${ebayBaseUrl()}/identity/v1/oauth2/token`;
}

export function defaultScopes(): string[] {
  const env = getEbayEnv();
  if (env.EBAY_SCOPES?.trim()) return env.EBAY_SCOPES.trim().split(/\s+/);
  // Minimal baseline; required for Trading calls with user token in many apps.
  return ['https://api.ebay.com/oauth/api_scope'];
}

export function randomState(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function pkceVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizeUrl(args: { state: string; code_challenge: string }) {
  const env = getEbayEnv();
  const url = new URL(ebayAuthUrl());
  url.searchParams.set('client_id', env.EBAY_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.EBAY_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', defaultScopes().join(' '));
  url.searchParams.set('state', args.state);
  url.searchParams.set('code_challenge', args.code_challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function basicAuthHeader() {
  const env = getEbayEnv();
  const token = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export async function exchangeCodeForTokens(args: { code: string; code_verifier: string }) {
  const env = getEbayEnv();
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', args.code);
  body.set('redirect_uri', env.EBAY_REDIRECT_URI);
  body.set('code_verifier', args.code_verifier);

  const res = await fetch(ebayTokenUrl(), {
    method: 'POST',
    headers: {
      authorization: basicAuthHeader(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error_description ?? json?.error ?? 'eBay token exchange failed.');
  return json as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in?: number;
    token_type: 'User Access Token';
    scope?: string;
  };
}

export async function refreshAccessToken(args: { refresh_token: string }) {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', args.refresh_token);
  body.set('scope', defaultScopes().join(' '));
  const res = await fetch(ebayTokenUrl(), {
    method: 'POST',
    headers: {
      authorization: basicAuthHeader(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error_description ?? json?.error ?? 'eBay token refresh failed.');
  return json as {
    access_token: string;
    expires_in: number;
    token_type: 'User Access Token';
    scope?: string;
  };
}

