import type { Card, CardAsset, CardTransaction } from '@/types/db';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type CardDetail = {
  card: Card;
  transactions: CardTransaction[];
  assets: Array<CardAsset & { signed_url?: string | null }>;
};

export async function getCardDetail(cardId: string): Promise<CardDetail | null> {
  const supabase = getSupabaseServerClient();

  const { data: card, error: cardError } = await supabase.from('cards').select('*').eq('id', cardId).maybeSingle();
  if (cardError) throw new Error(cardError.message);
  if (!card) return null;

  const { data: txs, error: txError } = await supabase
    .from('card_transactions')
    .select('*')
    .eq('card_id', cardId)
    .order('purchase_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (txError) throw new Error(txError.message);

  const { data: assets, error: assetError } = await supabase
    .from('card_assets')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });
  if (assetError) throw new Error(assetError.message);

  const assetsWithUrls: Array<CardAsset & { signed_url?: string | null }> = [];
  for (const a of (assets ?? []) as CardAsset[]) {
    let signed_url: string | null = null;
    if (a.bucket && a.path) {
      const { data: signed, error: signedErr } = await supabase.storage.from(a.bucket).createSignedUrl(a.path, 60 * 60);
      if (!signedErr) signed_url = signed?.signedUrl ?? null;
    }
    assetsWithUrls.push({ ...a, signed_url });
  }

  return {
    card: card as Card,
    transactions: (txs ?? []) as CardTransaction[],
    assets: assetsWithUrls,
  };
}

