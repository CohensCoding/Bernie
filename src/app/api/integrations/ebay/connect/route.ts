import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, pkceChallenge, pkceVerifier, randomState } from '@/lib/ebay/oauth';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60, // 10 minutes
};

export async function GET() {
  const state = randomState();
  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);

  const url = buildAuthorizeUrl({ state, code_challenge: challenge });
  const res = NextResponse.redirect(url);
  res.cookies.set('ebay_oauth_state', state, COOKIE_OPTS);
  res.cookies.set('ebay_oauth_verifier', verifier, COOKIE_OPTS);
  return res;
}

