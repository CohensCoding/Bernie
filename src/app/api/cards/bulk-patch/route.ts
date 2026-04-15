import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const LooseUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id format.');

const BodySchema = z.object({
  card_ids: z.array(LooseUuid).min(1),
  patch: z
    .object({
      sport: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
    })
    .strict(),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body.', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
        { status: 400 },
      );
    }

    const { card_ids, patch } = parsed.data;
    const updates: Record<string, string | null> = {};
    if (patch.sport !== undefined) updates.sport = patch.sport;
    if (patch.team !== undefined) updates.team = patch.team;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from('cards').update(updates).in('id', card_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, updated: card_ids.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
