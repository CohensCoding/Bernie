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
  uniquePlayers: number;
  uniqueSets: number;
};

export type SpendBreakdown = { key: string; spendCents: number; count: number };
export type CountBreakdown = { key: string; count: number };

export type ActivityPoint = { month: string; spendCents: number; count: number };

export type DashboardData = {
  kpis: DashboardKpis;
  spendBySport: SpendBreakdown[];
  spendByTeam: SpendBreakdown[];
  spendByPlayer: SpendBreakdown[];
  spendByBrandSet: SpendBreakdown[];
  countBySport: CountBreakdown[];
  countByTeam: CountBreakdown[];
  countByBrandSet: CountBreakdown[];
  countByGradingCompany: CountBreakdown[];
  completeness: {
    missingImages: number;
    missingIdentity: number;
    missingPurchaseInfo: number;
  };
  recentAdditions: Array<{
    card_id: string;
    label: string;
    created_at: string;
    total_cost_cents: number;
  }>;
  highestCostBasis: Array<{
    card_id: string;
    label: string;
    total_cost_cents: number;
  }>;
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

  const [{ data: cards, error: cardsError }, { data: txs, error: txError }, { data: assets, error: assetError }] = await Promise.all([
    supabase.from('cards').select('*'),
    supabase.from('card_transactions').select('*'),
    supabase.from('card_assets').select('id,card_id'),
  ]);

  if (cardsError) throw new Error(cardsError.message);
  if (txError) throw new Error(txError.message);
  if (assetError) throw new Error(assetError.message);

  const cardList = (cards ?? []) as Card[];
  const txList = (txs ?? []) as CardTransaction[];
  const cardById = new Map(cardList.map((c) => [c.id, c]));

  const totalCards = cardList.length;
  const gradedCards = cardList.filter((c) => c.graded).length;
  const rawCards = totalCards - gradedCards;

  const uniq = (vals: Array<string | null | undefined>) => {
    const s = new Set<string>();
    for (const v of vals) {
      const t = (v ?? '').trim();
      if (t) s.add(t);
    }
    return s.size;
  };

  const uniquePlayers = uniq(cardList.map((c) => c.player_name));
  const uniqueSets = uniq(cardList.map((c) => `${(c.brand ?? '').trim()} · ${(c.set_name ?? '').trim()}`));

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

  const countBy = (fn: (c: Card) => string) => {
    const map = new Map<string, number>();
    for (const c of cardList) {
      const key = keyOrUnknown(fn(c));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  };

  const countBySport = countBy((c) => c.sport ?? 'Unknown');
  const countByTeam = countBy((c) => c.team ?? 'Unknown');
  const countByBrandSet = countBy((c) => `${keyOrUnknown(c.brand)} · ${keyOrUnknown(c.set_name)}`);
  const countByGradingCompany = countBy((c) => (c.graded ? c.grading_company ?? 'Unknown' : 'Raw'));

  const assetCountByCard = new Map<string, number>();
  for (const a of (assets ?? []) as Array<{ card_id: string | null }>) {
    if (!a.card_id) continue;
    assetCountByCard.set(a.card_id, (assetCountByCard.get(a.card_id) ?? 0) + 1);
  }

  const missingImages = cardList.filter((c) => (assetCountByCard.get(c.id) ?? 0) === 0).length;
  const missingIdentity = cardList.filter((c) => !((c.player_name ?? '').trim().length || (c.title_raw ?? '').trim().length)).length;
  const txByCard = new Map<string, CardTransaction[]>();
  for (const t of txList) {
    const list = txByCard.get(t.card_id) ?? [];
    list.push(t);
    txByCard.set(t.card_id, list);
  }
  const missingPurchaseInfo = cardList.filter((c) => {
    const list = txByCard.get(c.id) ?? [];
    if (!list.length) return true;
    const t = list[0]!;
    const hasMoney = (t.total_cost_cents ?? 0) > 0 || (t.purchase_price_cents ?? 0) > 0;
    const hasMeta = Boolean((t.platform ?? '').trim().length || (t.purchase_date ?? '').toString().trim().length);
    return !(hasMoney && hasMeta);
  }).length;

  const labelFor = (c: Card) => {
    const parts = [
      c.player_name ?? null,
      c.year ? String(c.year) : null,
      c.brand ?? null,
      c.set_name ?? null,
      c.parallel ?? null,
    ].filter((x) => (x ?? '').toString().trim().length) as string[];
    return parts.length ? parts.join(' · ') : 'Card';
  };

  const recentAdditions = [...cardList]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 8)
    .map((c) => {
      const list = txByCard.get(c.id) ?? [];
      const top = list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
      return {
        card_id: c.id,
        label: labelFor(c),
        created_at: c.created_at,
        total_cost_cents: top?.total_cost_cents ?? 0,
      };
    });

  const highestCostBasis = [...cardList]
    .map((c) => {
      const list = txByCard.get(c.id) ?? [];
      const best = list.reduce((m, t) => Math.max(m, t.total_cost_cents ?? 0), 0);
      return { card_id: c.id, label: labelFor(c), total_cost_cents: best };
    })
    .sort((a, b) => b.total_cost_cents - a.total_cost_cents)
    .slice(0, 8);

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
    kpis: { totalCards, totalSpendCents, avgPurchasePriceCents, gradedCards, rawCards, uniquePlayers, uniqueSets },
    spendBySport,
    spendByTeam,
    spendByPlayer,
    spendByBrandSet,
    countBySport,
    countByTeam,
    countByBrandSet,
    countByGradingCompany,
    completeness: { missingImages, missingIdentity, missingPurchaseInfo },
    recentAdditions,
    highestCostBasis,
    activityByMonth,
  };
}

