import { NextResponse } from 'next/server';
import { exchangeCodeForTokens, defaultScopes } from '@/lib/ebay/oauth';
import { upsertEbayConnection } from '@/lib/ebay/connection';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return NextResponse.redirect(new URL('/import/ebay?error=missing_code', url.origin));

  const cookies = req.headers.get('cookie') ?? '';
  const stateCookie = cookies.match(/(?:^|;\s*)ebay_oauth_state=([^;]+)/)?.[1] ?? null;
  const verifier = cookies.match(/(?:^|;\s*)ebay_oauth_verifier=([^;]+)/)?.[1] ?? null;

  if (!stateCookie || !verifier || decodeURIComponent(stateCookie) !== state) {
    return NextResponse.redirect(new URL('/import/ebay?error=state_mismatch', url.origin));
  }

  try {
    const token = await exchangeCodeForTokens({ code, code_verifier: decodeURIComponent(verifier) });
    const scopeList = token.scope ? token.scope.split(/\s+/).filter(Boolean) : defaultScopes();
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
    await upsertEbayConnection({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scopes: scopeList,
      expires_at: expiresAt,
    });
    const res = NextResponse.redirect(new URL('/import/ebay?connected=1', url.origin));
    res.cookies.set('ebay_oauth_state', '', { path: '/', maxAge: 0 });
    res.cookies.set('ebay_oauth_verifier', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'OAuth failed';
    const looksLikeMissingTable =
      /Could not find the table/i.test(msg) || /schema cache/i.test(msg) || /integrations_ebay_connection/i.test(msg);
    if (looksLikeMissingTable) {
      return NextResponse.redirect(new URL('/import/ebay?error=EBAY_DB_NOT_MIGRATED', url.origin));
    }
    return NextResponse.redirect(new URL(`/import/ebay?error=${encodeURIComponent(msg)}`, url.origin));
  }
}

