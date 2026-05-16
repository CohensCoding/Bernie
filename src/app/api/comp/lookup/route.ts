/**
 * POST /api/comp/lookup — JSON wrapper around `performCompLookup`.
 */

import { NextResponse } from 'next/server';

import { CompLookupBodySchema, performCompLookup } from '@/lib/layer2/lookup/performLookup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const parsed = CompLookupBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid request body: ${parsed.error.issues.map((i) => i.message).join('; ')}` },
      { status: 400 },
    );
  }

  const out = await performCompLookup(parsed.data);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.httpStatus });
  }

  return NextResponse.json(out.data);
}
