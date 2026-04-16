import type { ValuationProvider } from '@/lib/valuation/providers/provider';
import type { CardIdentity } from '@/lib/valuation/types';

function centsFromPriceText(t: string): number | null {
  const m = /\$([0-9][0-9,]*)(?:\.([0-9]{2}))?/.exec(t);
  if (!m) return null;
  const dollars = Number(m[1].replace(/,/g, ''));
  const cents = Number(m[2] ?? '0');
  if (!Number.isFinite(dollars) || !Number.isFinite(cents)) return null;
  return dollars * 100 + cents;
}

function median(xs: number[]) {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? a[mid]! : Math.round((a[mid - 1]! + a[mid]!) / 2);
}

function percentile(xs: number[], p: number) {
  const a = [...xs].sort((x, y) => x - y);
  if (a.length === 0) return null;
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[idx]!;
}

function buildExactQuery(card: CardIdentity): string | null {
  const parts: string[] = [];
  const player = (card.player_name ?? '').trim();
  if (player) parts.push(player);
  const year = card.year != null ? String(card.year) : '';
  if (year) parts.push(year);
  const brand = (card.brand ?? '').trim();
  if (brand) parts.push(brand);
  const set = (card.set_name ?? '').trim();
  if (set) parts.push(set);
  const num = (card.card_number ?? '').trim();
  if (num) parts.push(num);
  const parallel = (card.parallel ?? '').trim();
  if (parallel) parts.push(parallel);
  if (card.graded) {
    const gc = (card.grading_company ?? '').trim();
    const g = (card.grade ?? '').trim();
    if (gc) parts.push(gc);
    if (g) parts.push(g);
  }
  const q = parts.join(' ').trim();
  return q.length >= 6 ? q : null;
}

function buildNearQuery(card: CardIdentity): string | null {
  const parts: string[] = [];
  const player = (card.player_name ?? '').trim();
  if (player) parts.push(player);
  const year = card.year != null ? String(card.year) : '';
  if (year) parts.push(year);
  const brand = (card.brand ?? '').trim();
  if (brand) parts.push(brand);
  const set = (card.set_name ?? '').trim();
  if (set) parts.push(set);
  const num = (card.card_number ?? '').trim();
  if (num) parts.push(num);
  const q = parts.join(' ').trim();
  return q.length >= 6 ? q : null;
}

async function fetchSoldPrices(query: string): Promise<number[]> {
  const url = new URL('https://www.ebay.com/sch/i.html');
  url.searchParams.set('_nkw', query);
  url.searchParams.set('LH_Sold', '1');
  url.searchParams.set('LH_Complete', '1');
  url.searchParams.set('_sop', '13'); // recently ended

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'user-agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`eBay search failed (${res.status}).`);
  if (/Pardon Our Interruption/i.test(html) || /Checking your browser/i.test(html)) {
    throw new Error('eBay blocked public access.');
  }

  // Conservative parse: only capture prices from standard "s-item__price" spans.
  const prices: number[] = [];
  const re = /s-item__price[^>]*>\s*([^<]{1,40})</gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    // Skip ranges like "$2.99 to $5.99".
    if (/\bto\b/i.test(raw)) continue;
    const cents = centsFromPriceText(raw);
    if (cents == null) continue;
    // Skip absurd outliers (protect against parsing junk).
    if (cents <= 0 || cents > 10_000_00) continue;
    prices.push(cents);
    if (prices.length >= 30) break;
  }
  return prices;
}

export const ebaySoldValuationProvider: ValuationProvider = {
  id: 'ebay_sold_public',
  async valueCard(card) {
    const exactQ = buildExactQuery(card);
    const nearQ = buildNearQuery(card);
    if (!exactQ && !nearQ) {
      return {
        provider: 'ebay_sold_public',
        status: 'unavailable',
        confidence: 0,
        match_notes: 'Insufficient identity to search sold comps.',
        low_cents: null,
        mid_cents: null,
        high_cents: null,
        last_comp_price_cents: null,
        last_comp_date: null,
        comp_count: null,
      };
    }

    try {
      let prices: number[] = [];
      let mode: 'exact' | 'near' = 'near';

      if (exactQ) {
        const exactPrices = await fetchSoldPrices(exactQ);
        if (exactPrices.length >= 3) {
          prices = exactPrices;
          mode = 'exact';
        }
      }
      if (prices.length < 3 && nearQ) {
        const nearPrices = await fetchSoldPrices(nearQ);
        prices = nearPrices;
        mode = 'near';
      }

      if (prices.length < 3) {
        return {
          provider: 'ebay_sold_public',
          status: 'unavailable',
          confidence: 0,
          match_notes: 'Not enough recent sold comps to price confidently.',
          low_cents: null,
          mid_cents: null,
          high_cents: null,
          last_comp_price_cents: null,
          last_comp_date: null,
          comp_count: prices.length,
        };
      }

      const mid = median(prices);
      const low = percentile(prices, 0.25);
      const high = percentile(prices, 0.75);

      const confidence =
        mode === 'exact'
          ? prices.length >= 8
            ? 0.8
            : prices.length >= 5
              ? 0.65
              : 0.55
          : prices.length >= 10
            ? 0.4
            : 0.3;

      return {
        provider: 'ebay_sold_public',
        status: 'ok',
        confidence,
        match_notes: mode === 'exact' ? 'Sold comps (exact identity search).' : 'Sold comps (near match search).',
        low_cents: low,
        mid_cents: mid,
        high_cents: high,
        last_comp_price_cents: prices[0] ?? null,
        last_comp_date: null,
        comp_count: prices.length,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sold comp lookup failed.';
      return {
        provider: 'ebay_sold_public',
        status: 'error',
        confidence: 0,
        match_notes: `Sold comp lookup error: ${msg}`,
        low_cents: null,
        mid_cents: null,
        high_cents: null,
        last_comp_price_cents: null,
        last_comp_date: null,
        comp_count: null,
      };
    }
  },
};

