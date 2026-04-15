import { NextResponse } from 'next/server';
import { disconnectEbay } from '@/lib/ebay/connection';

export async function POST() {
  try {
    await disconnectEbay();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

