import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, pkceChallenge, pkceVerifier, randomState } from '@/lib/ebay/oauth';

const COOKIE_OPTS = {
  httpOnly: true,
  // In dev (http://localhost) secure cookies won't be set, which breaks PKCE state.
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60, // 10 minutes
};

export async function GET(req: Request) {
  try {
    const state = randomState();
    const verifier = pkceVerifier();
    const challenge = pkceChallenge(verifier);

    const url = buildAuthorizeUrl({ state, code_challenge: challenge });
    const res = NextResponse.redirect(url);
    res.cookies.set('ebay_oauth_state', state, COOKIE_OPTS);
    res.cookies.set('ebay_oauth_verifier', verifier, COOKIE_OPTS);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unable to start eBay OAuth.';
    // Redirect back into the app with a readable error instead of a blank 500 page.
    return NextResponse.redirect(new URL(`/import/ebay?error=${encodeURIComponent(msg)}`, req.url));
  }
}

