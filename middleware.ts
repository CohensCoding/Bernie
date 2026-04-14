import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  // If env isn't configured, just pass through.
  if (!supabase) return response;

  // Refresh session if needed (no-op if not using auth yet).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
      Match all request paths except:
      - _next static files
      - static assets
      - API routes
    */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};

