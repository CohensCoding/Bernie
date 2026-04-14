import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { extractFromAssets } from '@/lib/ingest/extractFromAssets';
import { ExtractionPayloadSchema } from '@/types/extraction';

const QuerySchema = z.object({
  cardId: z.string().uuid(),
  assetIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cardId: url.searchParams.get('cardId'),
    assetIds: url.searchParams.get('assetIds') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Missing cardId' }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const debugId = crypto.randomUUID();

  try {
    let q = supabase
      .from('card_assets')
      .select('id,bucket,path,mime_type,size_bytes,asset_type,card_id')
      .eq('card_id', parsed.data.cardId)
      .eq('asset_type', 'screenshot')
      .order('created_at', { ascending: false })
      .limit(3);

    if (parsed.data.assetIds.length) {
      q = q.in('id', parsed.data.assetIds).limit(3);
    }

    const { data: assets, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!assets || assets.length === 0) {
      return NextResponse.json({ error: 'No screenshots found for this card.' }, { status: 400 });
    }

    // Create signed URLs for model input
    const signedAssets = [];
    for (const a of assets) {
      const { data: signed, error: signedErr } = await supabase.storage.from(a.bucket).createSignedUrl(a.path, 10 * 60);
      if (signedErr || !signed?.signedUrl) {
        return NextResponse.json({ error: `Storage signed-url failed for ${a.path}` }, { status: 500 });
      }
      signedAssets.push({
        id: a.id as string,
        bucket: a.bucket as string,
        path: a.path as string,
        signed_url: signed.signedUrl,
      });
    }

    console.log('[extract]', { debugId, cardId: parsed.data.cardId, assetCount: signedAssets.length, assetPaths: signedAssets.map((a) => a.path) });

    const result = await extractFromAssets(
      signedAssets.map((a) => ({ id: a.id, bucket: a.bucket, path: a.path, signed_url: a.signed_url })),
    );
    if (!result.ok) {
      console.log('[extract_failed]', { debugId, error: result.error });
      return NextResponse.json({ error: result.error, debugId }, { status: 500 });
    }

    // Validate output once more defensively
    const validated = ExtractionPayloadSchema.safeParse(result.extraction);
    if (!validated.success) {
      console.log('[extract_malformed]', { debugId, issues: validated.error.issues });
      return NextResponse.json({ error: 'Malformed extractor output.', debugId }, { status: 500 });
    }

    const nonNullCount = countNonNull(validated.data);
    if (nonNullCount < 3) {
      console.log('[extract_empty]', { debugId, nonNullCount });
      return NextResponse.json(
        { error: 'Extraction returned too little usable data. Try different screenshots.', debugId },
        { status: 422 },
      );
    }

    // Persist raw extraction to each used asset (best effort)
    const avgConfidence = averageConfidence(validated.data);
    await supabase
      .from('card_assets')
      .update({
        extraction_model: result.model,
        extraction_confidence: avgConfidence,
        extraction_raw: {
          debug_id: debugId,
          provider: 'openai',
          model: result.model,
          extracted_at: new Date().toISOString(),
          inputs: signedAssets.map((a) => ({ id: a.id, bucket: a.bucket, path: a.path })),
          extraction: validated.data,
        },
      })
      .in(
        'id',
        signedAssets.map((a) => a.id),
      );

    return NextResponse.json({ ok: true, debugId, model: result.model, extraction: validated.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.log('[extract_exception]', { debugId, error: msg });
    return NextResponse.json({ error: msg, debugId }, { status: 500 });
  }
}

function averageConfidence(extraction: any): number | null {
  const vals: number[] = [];
  for (const v of Object.values(extraction)) {
    const c = (v as any)?.confidence;
    if (typeof c === 'number' && Number.isFinite(c)) vals.push(c);
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function countNonNull(extraction: any): number {
  let c = 0;
  for (const v of Object.values(extraction)) {
    const value = (v as any)?.value;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    c += 1;
  }
  return c;
}

