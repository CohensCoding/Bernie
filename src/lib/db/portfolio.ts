import type { Card, CardTransaction } from '@/types/db';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type PortfolioRow = {
  card: Card;
  latestTransaction: CardTransaction | null;
};

export async function getPortfolioRows(): Promise<PortfolioRow[]> {
  const supabase = getSupabaseServerClient();

  // Fetch cards + latest transaction per card (client-side merge; seed sizes are small)
  const [{ data: cards, error: cardsError }, { data: txs, error: txError }] = await Promise.all([
    supabase.from('cards').select('*').order('created_at', { ascending: false }),
    supabase
      .from('card_transactions')
      .select('*')
      .order('purchase_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ]);

  if (cardsError) throw new Error(cardsError.message);
  if (txError) throw new Error(txError.message);

  const latestByCard = new Map<string, CardTransaction>();
  for (const tx of (txs ?? []) as CardTransaction[]) {
    if (!latestByCard.has(tx.card_id)) latestByCard.set(tx.card_id, tx);
  }

  return ((cards ?? []) as Card[]).map((card) => ({
    card,
    latestTransaction: latestByCard.get(card.id) ?? null,
  }));
}

export type DashboardKpis = {
  totalCards: number;
  totalSpendCents: number;
  avgPurchasePriceCents: number;
  gradedCards: number;
  rawCards: number;
};

export type SpendBreakdown = { key: string; spendCents: number; count: number };

export type ActivityPoint = { month: string; spendCents: number; count: number };

export type DashboardData = {
  kpis: DashboardKpis;
  spendBySport: SpendBreakdown[];
  spendByTeam: SpendBreakdown[];
  spendByPlayer: SpendBreakdown[];
  spendByBrandSet: SpendBreakdown[];
  activityByMonth: ActivityPoint[];
};

function keyOrUnknown(v: string | null | undefined) {
  const t = (v ?? '').trim();
  return t.length ? t : 'Unknown';
}

function monthKey(dateStr: string) {
  // dateStr is YYYY-MM-DD
  return dateStr.slice(0, 7);
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseServerClient();

  const [{ data: cards, error: cardsError }, { data: txs, error: txError }] = await Promise.all([
    supabase.from('cards').select('*'),
    supabase.from('card_transactions').select('*'),
  ]);

  if (cardsError) throw new Error(cardsError.message);
  if (txError) throw new Error(txError.message);

  const cardList = (cards ?? []) as Card[];
  const txList = (txs ?? []) as CardTransaction[];
  const cardById = new Map(cardList.map((c) => [c.id, c]));

  const totalCards = cardList.length;
  const gradedCards = cardList.filter((c) => c.graded).length;
  const rawCards = totalCards - gradedCards;

  const totalSpendCents = txList.reduce((sum, t) => sum + (t.total_cost_cents ?? 0), 0);
  const avgPurchasePriceCents =
    txList.length === 0
      ? 0
      : Math.round(txList.reduce((sum, t) => sum + (t.purchase_price_cents ?? 0), 0) / txList.length);

  const spendBy = (fn: (c: Card) => string) => {
    const map = new Map<string, { spendCents: number; count: number }>();
    for (const tx of txList) {
      const c = cardById.get(tx.card_id);
      if (!c) continue;
      const key = keyOrUnknown(fn(c));
      const prev = map.get(key) ?? { spendCents: 0, count: 0 };
      prev.spendCents += tx.total_cost_cents ?? 0;
      prev.count += 1;
      map.set(key, prev);
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, spendCents: v.spendCents, count: v.count }))
      .sort((a, b) => b.spendCents - a.spendCents);
  };

  const spendBySport = spendBy((c) => c.sport ?? 'Unknown');
  const spendByTeam = spendBy((c) => c.team ?? 'Unknown');
  const spendByPlayer = spendBy((c) => c.player_name ?? 'Unknown');
  const spendByBrandSet = spendBy((c) => {
    const brand = keyOrUnknown(c.brand);
    const set = keyOrUnknown(c.set_name);
    return `${brand} · ${set}`;
  });

  const activityMap = new Map<string, { spendCents: number; count: number }>();
  for (const tx of txList) {
    if (!tx.purchase_date) continue;
    const m = monthKey(tx.purchase_date);
    const prev = activityMap.get(m) ?? { spendCents: 0, count: 0 };
    prev.spendCents += tx.total_cost_cents ?? 0;
    prev.count += 1;
    activityMap.set(m, prev);
  }

  const activityByMonth = [...activityMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, spendCents: v.spendCents, count: v.count }));

  return {
    kpis: { totalCards, totalSpendCents, avgPurchasePriceCents, gradedCards, rawCards },
    spendBySport,
    spendByTeam,
    spendByPlayer,
    spendByBrandSet,
    activityByMonth,
  };
}

