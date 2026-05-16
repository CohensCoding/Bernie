import type { Card, CardAsset, CardTransaction, CardValuationCurrent } from '@/types/db';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type CardDetail = {
  card: Card;
  transactions: CardTransaction[];
  assets: Array<CardAsset & { signed_url?: string | null }>;
  valuation_current: CardValuationCurrent | null;
};

export async function getCardDetail(cardId: string): Promise<CardDetail | null> {
  const supabase = getSupabaseServerClient();

  const [{ data: card, error: cardError }, { data: val, error: valError }] = await Promise.all([
    supabase.from('cards').select('*').eq('id', cardId).maybeSingle(),
    supabase.from('card_valuations_current').select('*').eq('card_id', cardId).maybeSingle(),
  ]);
  if (cardError) throw new Error(cardError.message);
  if (valError) throw new Error(valError.message);
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
    valuation_current: (val ?? null) as CardValuationCurrent | null,
  };
}

export type CreateCardWithPurchaseIdentity = {
  player: string;
  year: number;
  setName: string;
  cardNumber?: string | null;
  parallel?: string | null;
  grader: string;
  grade: string;
  isRookie?: boolean;
  isAutograph?: boolean;
  isPatch?: boolean;
};

export type CreateCardWithPurchaseArgs = {
  identity: CreateCardWithPurchaseIdentity;
  purchase: {
    /** Total amount paid including tax/shipping (integer cents). */
    pricePaidCents: number;
    purchaseDate: string;
    notes?: string;
  };
  canonicalCardId: string;
};

function buildTitleRawFromPurchaseIdentity(i: CreateCardWithPurchaseIdentity): string {
  const parts = [
    i.year,
    i.setName,
    i.player,
    i.parallel,
    `${i.grader} ${i.grade}`,
  ].filter((p) => p != null && String(p).trim() !== '');
  return parts.join(' · ');
}

/**
 * Layer 2 comp-save helper: inserts a `cards` row, inserts a matching `card_transactions` purchase row,
 * and upserts into `card_canonical_links`.
 *
 * **Execution model (explicitly _not_ a Postgres transaction via the Supabase client):** Steps run as
 * separate awaits in order (`cards.insert` → `card_transactions.insert` → `card_canonical_links.upsert`).
 * If anything after the first insert fails, `catch` issues `cards.delete.eq('id', cardId)`. Because
 * `card_transactions.card_id` is defined with **`ON DELETE CASCADE`**, deleting the parent `cards`
 * row removes the child transaction row that was inserted in the preceding step—so we do **not**
 * delete the tx row separately.
 *
 * There is therefore a brief window where a `cards` row (and possibly a linked `card_transactions`)
 * exists without a canonical link—or where other sessions can observe inconsistent state—and this
 * call is **not atomic**. If `cards.delete` itself fails after a linkage failure, orphaned rows would
 * remain until manual cleanup (this helper does not retry cleanup).
 *
 * On success returns `{ cardId }`. Throws on failures so API callers can map to HTTP errors.
 */
export async function createCardWithPurchase(args: CreateCardWithPurchaseArgs): Promise<{ cardId: string }> {
  const supabase = getSupabaseServerClient();
  const { identity, purchase, canonicalCardId } = args;

  const cents = purchase.pricePaidCents;
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error('createCardWithPurchase: pricePaidCents must be a non-negative integer');
  }

  const titleRaw = buildTitleRawFromPurchaseIdentity(identity);

  const { data: cardRow, error: cardErr } = await supabase
    .from('cards')
    .insert({
      owner_id: null,
      title_raw: titleRaw,
      player_name: identity.player,
      year: identity.year,
      set_name: identity.setName,
      card_number: identity.cardNumber ?? null,
      parallel: identity.parallel ?? null,
      rookie: identity.isRookie ?? false,
      auto: identity.isAutograph ?? false,
      patch: identity.isPatch ?? false,
      graded: identity.grader !== 'RAW',
      grading_company: identity.grader === 'RAW' ? null : identity.grader,
      grade: identity.grade,
    })
    .select('id')
    .single();

  if (cardErr || !cardRow) {
    throw new Error(`createCardWithPurchase (cards): ${cardErr?.message ?? 'no row'}`);
  }

  const cardId = cardRow.id as string;

  try {
    const { error: txErr } = await supabase
      .from('card_transactions')
      .insert({
        owner_id: null,
        card_id: cardId,
        platform: 'comp_lookup',
        source_url: null,
        title_raw: titleRaw,
        purchase_date: purchase.purchaseDate,
        purchase_price_cents: cents,
        taxes_cents: 0,
        shipping_cents: 0,
        total_cost_cents: cents,
        notes: purchase.notes ?? null,
      })
      .select('id')
      .single();

    if (txErr) {
      throw new Error(`createCardWithPurchase (card_transactions): ${txErr.message}`);
    }

    const { error: linkErr } = await supabase.from('card_canonical_links').upsert(
      {
        card_id: cardId,
        canonical_card_id: canonicalCardId,
        linked_by: 'user_manual',
      },
      { onConflict: 'card_id' },
    );

    if (linkErr) {
      throw new Error(`createCardWithPurchase (card_canonical_links): ${linkErr.message}`);
    }
  } catch (e) {
    const { error: delErr } = await supabase.from('cards').delete().eq('id', cardId);
    if (delErr) {
      console.warn(`[createCardWithPurchase] cleanup delete failed after error: ${delErr.message}`);
    }
    throw e;
  }

  return { cardId };
}
