import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const BodySchema = z.object({
  card_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const cardIds = parsed.data.card_ids;

    // Fetch storage objects linked to these cards (best effort cleanup).
    const { data: assets, error: assetErr } = await supabase
      .from('card_assets')
      .select('bucket,path,card_id')
      .in('card_id', cardIds);
    if (assetErr) {
      return NextResponse.json({ error: assetErr.message }, { status: 500 });
    }

    const byBucket = new Map<string, string[]>();
    for (const a of (assets ?? []) as Array<{ bucket: string; path: string }>) {
      const bucket = a.bucket ?? 'card-assets';
      const list = byBucket.get(bucket) ?? [];
      list.push(a.path);
      byBucket.set(bucket, list);
    }

    const storageResults: Array<{ bucket: string; removed: number; error?: string }> = [];
    for (const [bucket, paths] of byBucket.entries()) {
      if (!paths.length) continue;
      const { error } = await supabase.storage.from(bucket).remove(paths);
      storageResults.push({ bucket, removed: paths.length, error: error?.message });
      // Intentionally do not fail the whole delete if storage cleanup fails; DB is source of truth.
    }

    // Delete cards (cascades to transactions/assets rows).
    const { error: delErr } = await supabase.from('cards').delete().in('id', cardIds);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      deleted: cardIds.length,
      storage: storageResults,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

