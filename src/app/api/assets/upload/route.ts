import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const MAX_FILES = 3;
const MAX_BYTES = 12 * 1024 * 1024; // 12MB each
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BUCKET = 'card-assets';

const UploadSchema = z.object({
  card_id: z.string().uuid(),
  transaction_id: z.string().uuid().optional().or(z.literal('')),
});

function extFromMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const raw = {
      card_id: String(form.get('card_id') ?? ''),
      transaction_id: String(form.get('transaction_id') ?? ''),
    };

    const parsed = UploadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid card/transaction id.' }, { status: 400 });
    }

    const files = form.getAll('files').filter((v): v is File => v instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files selected.' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Upload up to ${MAX_FILES} screenshots.` }, { status: 400 });
    }

    for (const f of files) {
      if (!ALLOWED_TYPES.has(f.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${f.type || 'unknown'}. Use PNG, JPG, or WEBP.` },
          { status: 400 },
        );
      }
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: `File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)}MB.` }, { status: 400 });
      }
    }

    const supabase = getSupabaseServerClient();
    const now = Date.now();

    const createdAssets: Array<{ id: string; path: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const ext = extFromMime(file.type);
      const path = `${parsed.data.card_id}/${now}-${i}.${ext}`;

      const buf = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buf, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        return NextResponse.json(
          {
            error:
              uploadError.message +
              (uploadError.message.toLowerCase().includes('bucket') ? ` (Missing bucket '${BUCKET}'?)` : ''),
          },
          { status: 500 },
        );
      }

      const { data: inserted, error: insertError } = await supabase
        .from('card_assets')
        .insert({
          asset_type: 'screenshot',
          bucket: BUCKET,
          path,
          mime_type: file.type,
          size_bytes: file.size,
          card_id: parsed.data.card_id,
          transaction_id: parsed.data.transaction_id ? parsed.data.transaction_id : null,
        })
        .select('id, path')
        .single();

      if (insertError) {
        // Best-effort cleanup: remove uploaded object if DB insert fails.
        await supabase.storage.from(BUCKET).remove([path]);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      createdAssets.push({ id: inserted.id as string, path: inserted.path as string });
    }

    return NextResponse.json({ ok: true, assets: createdAssets });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

