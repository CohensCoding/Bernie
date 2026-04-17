import type { ValuationProvider } from '@/lib/valuation/providers/provider';
import type { CardIdentity } from '@/lib/valuation/types';

const PROVIDER_ID = 'ebay_sold_public';

/** Below this, we return unavailable instead of a shaky estimate. */
const MIN_CONFIDENCE_TO_PUBLISH = 0.22;
/** Need at least this many comps after relevance filtering. */
const MIN_COMPS = 3;
/** Hard cap for this provider — never pretend to be tighter than this. */
const MAX_CONFIDENCE = 0.72;

type SoldRow = {
  /** 0 = first listing on results page (typically most recently sold for LH_Sold) */
  listIndex: number;
  title: string;
  priceCents: number;
  /** Raw caption eBay shows under price, e.g. "Sold Jan 12, 2026" */
  soldCaption: string | null;
};

type ScoredSoldRow = SoldRow & { score: number; notes: string[] };

function centsFromPriceText(t: string): number | null {
  const m = /\$([0-9][0-9,]*)(?:\.([0-9]{2}))?/.exec(t);
  if (!m) return null;
  const dollars = Number(m[1].replace(/,/g, ''));
  const cents = Number(m[2] ?? '0');
  if (!Number.isFinite(dollars) || !Number.isFinite(cents)) return null;
  return dollars * 100 + cents;
}

function normAlnum(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normTokens(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s#/-]+/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function cardNumberVariants(raw: string | null | undefined): string[] {
  const t = (raw ?? '').trim();
  if (!t) return [];
  const out = new Set<string>();
  out.add(t.toLowerCase());
  out.add(normAlnum(t));
  out.add(t.replace(/^#/, '').trim().toLowerCase());
  return [...out];
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

/**
 * Best-effort parse of eBay sold search HTML into rows with title + price.
 * Listing order is typically newest-first with _sop=13.
 */
function parseSoldSearchRows(html: string): SoldRow[] {
  const rows: SoldRow[] = [];
  let pos = 0;
  let listIndex = 0;
  while (pos < html.length) {
    const tIdx = html.indexOf('s-item__title', pos);
    if (tIdx === -1) break;
    const window = html.slice(tIdx, tIdx + 8000);

    let title: string | null = null;
    const heading = /role="heading"[^>]*>([^<]{3,400})</i.exec(window);
    if (heading) title = heading[1]!.replace(/\s+/g, ' ').trim();
    if (!title) {
      const legacy = /<[^>]*class="[^"]*s-item__title[^"]*"[^>]*>[\s\S]{0,800}?>([^<]{3,400})</i.exec(window);
      if (legacy) title = legacy[1]!.replace(/\s+/g, ' ').trim();
    }

    const pIdx = window.indexOf('s-item__price');
    if (pIdx === -1) {
      pos = tIdx + 12;
      continue;
    }
    const priceSlice = window.slice(pIdx, pIdx + 400);
    const priceM = /s-item__price[^>]*>\s*([^<]{1,40})/i.exec(priceSlice);
    const rawPrice = priceM?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    if (!rawPrice || /\bto\b/i.test(rawPrice)) {
      pos = tIdx + 12;
      continue;
    }
    const cents = centsFromPriceText(rawPrice);
    if (cents == null || cents <= 0 || cents > 10_000_00) {
      pos = tIdx + 12;
      continue;
    }

    let soldCaption: string | null = null;
    const cap =
      /s-item__caption[^>]*>\s*([^<]{4,120})/i.exec(window) ||
      /s-item__caption--signal[^>]*>\s*([^<]{4,120})/i.exec(window);
    if (cap) soldCaption = cap[1]!.replace(/\s+/g, ' ').trim();

    if (title) {
      rows.push({ listIndex, title, priceCents: cents, soldCaption });
      listIndex += 1;
    }
    pos = tIdx + 12;
  }
  return rows;
}

function parseSoldDateHint(caption: string | null): string | null {
  if (!caption) return null;
  const m = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(\d{4})/i.exec(caption);
  if (!m) return null;
  const months: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const mo = months[m[1]!.toLowerCase().slice(0, 3)];
  if (!mo) return null;
  const day = String(Number(m[2])).padStart(2, '0');
  const y = m[3]!;
  return `${y}-${mo}-${day}`;
}

type ScoreResult = { score: number; notes: string[] };

/**
 * Simple relevance score 0–100 + human-readable penalty notes.
 * Conservative: mismatches on grade / parallel / card # pull score down hard.
 */
function displayName(card: CardIdentity) {
  return (card.player_name ?? card.title_raw ?? '').trim();
}

function scoreListing(card: CardIdentity, title: string): ScoreResult {
  const notes: string[] = [];
  const t = title.toLowerCase();
  const tNorm = normAlnum(t);
  let score = 0;

  const player = displayName(card);
  if (player) {
    const parts = player.split(/\s+/).filter((p) => p.length > 1);
    const last = parts[parts.length - 1]?.toLowerCase() ?? '';
    const first = parts[0]?.toLowerCase() ?? '';
    if (last && t.includes(last)) {
      score += 28;
      notes.push('player_last');
    } else if (first && t.includes(first)) {
      score += 12;
      notes.push('player_first');
    } else if (normAlnum(player) && tNorm.includes(normAlnum(player))) {
      score += 18;
      notes.push('player_norm');
    }
  }

  if (card.year != null) {
    const y = String(card.year);
    if (new RegExp(`\\b${y}\\b`).test(t)) {
      score += 18;
      notes.push('year');
    }
  }

  const brand = (card.brand ?? '').trim();
  if (brand.length >= 3 && t.includes(brand.toLowerCase())) {
    score += 10;
    notes.push('brand');
  }

  const set = (card.set_name ?? '').trim();
  if (set.length >= 4) {
    const stoks = normTokens(set).filter((w) => w.length > 3).slice(0, 4);
    let hit = 0;
    for (const w of stoks) {
      if (t.includes(w)) hit++;
    }
    if (hit >= 2) {
      score += 12;
      notes.push('set_strong');
    } else if (hit === 1) {
      score += 5;
      notes.push('set_weak');
    }
  }

  const nums = cardNumberVariants(card.card_number);
  let numHit = false;
  for (const n of nums) {
    if (!n) continue;
    if (n.length >= 2 && t.includes(n)) {
      numHit = true;
      break;
    }
  }
  if (nums.length && numHit) {
    score += 22;
    notes.push('card#');
  } else if (nums.length) {
    score -= 18;
    notes.push('card#_miss');
  }

  const par = (card.parallel ?? '').trim();
  if (par.length >= 3) {
    const pLow = par.toLowerCase();
    if (t.includes(pLow)) {
      score += 14;
      notes.push('parallel');
    } else {
      score -= 12;
      notes.push('parallel_miss');
    }
  }

  if (card.graded) {
    const gc = (card.grading_company ?? '').trim().toLowerCase();
    const g = (card.grade ?? '').trim();
    if (gc && t.includes(gc)) {
      score += 8;
      notes.push('grader');
    }
    if (g && new RegExp(`\\b${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)) {
      score += 10;
      notes.push('grade');
    }
    const gradeTokens = ['psa', 'bgs', 'sgc', 'cgc', 'beckett'];
    const otherSlab = gradeTokens.filter((x) => x !== gc).some((x) => t.includes(x) && gc && !t.includes(gc));
    if (otherSlab) {
      score -= 25;
      notes.push('grader_mismatch');
    }
    if (g && /\bpsa\s*10\b/i.test(t) && g !== '10') {
      score -= 35;
      notes.push('grade_conflict');
    }
    if (g && /\bpsa\s*9\b/i.test(t) && g === '10') {
      score -= 35;
      notes.push('grade_conflict');
    }
  } else {
    if (/\bpsa\b|\bbgs\b|\bgraded\b|\bsgc\b|\bcgc\b/i.test(t)) {
      score -= 22;
      notes.push('looks_graded_listing');
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, notes };
}

function buildExactQuery(card: CardIdentity): string | null {
  const parts: string[] = [];
  const player = displayName(card);
  if (player) parts.push(player.slice(0, 80));
  if (card.year != null) parts.push(String(card.year));
  const brand = (card.brand ?? '').trim();
  if (brand) parts.push(brand);
  const set = (card.set_name ?? '').trim();
  if (set) parts.push(set);
  const sub = (card.subset ?? '').trim();
  if (sub && sub.length <= 40) parts.push(sub);
  const num = (card.card_number ?? '').trim();
  if (num) parts.push(num);
  const par = (card.parallel ?? '').trim();
  if (par) parts.push(par);
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
  const player = displayName(card);
  if (player) parts.push(player.slice(0, 80));
  if (card.year != null) parts.push(String(card.year));
  const brand = (card.brand ?? '').trim();
  if (brand) parts.push(brand);
  const set = (card.set_name ?? '').trim();
  if (set) parts.push(set);
  const num = (card.card_number ?? '').trim();
  if (num) parts.push(num);
  const q = parts.join(' ').trim();
  return q.length >= 6 ? q : null;
}

async function fetchSoldRows(query: string): Promise<SoldRow[]> {
  const url = new URL('https://www.ebay.com/sch/i.html');
  url.searchParams.set('_nkw', query);
  url.searchParams.set('LH_Sold', '1');
  url.searchParams.set('LH_Complete', '1');
  url.searchParams.set('_sop', '13');

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
  return parseSoldSearchRows(html);
}

type Tier = 'exact' | 'near';

function filterAndScore(card: CardIdentity, rows: SoldRow[], tier: Tier, minScore: number) {
  const scored: ScoredSoldRow[] = [];
  for (const r of rows) {
    const { score, notes } = scoreListing(card, r.title);
    if (score >= minScore) scored.push({ ...r, score, notes });
  }
  scored.sort((a, b) => b.score - a.score);
  const avg = scored.length ? scored.reduce((s, x) => s + x.score, 0) / scored.length : 0;
  return { scored, avgScore: avg, tier };
}

function confidenceFromComps(args: {
  tier: Tier;
  count: number;
  avgScore: number;
  worstNotes: Set<string>;
}): number {
  let c = 0.22;
  c += Math.min(0.12, Math.max(0, (args.count - 3) * 0.025));
  c *= args.avgScore / 100;
  if (args.tier === 'near') c *= 0.62;
  if (args.worstNotes.has('grade_conflict') || args.worstNotes.has('grader_mismatch')) c *= 0.45;
  if (args.worstNotes.has('card#_miss')) c *= 0.55;
  if (args.worstNotes.has('parallel_miss')) c *= 0.65;
  if (args.worstNotes.has('looks_graded_listing')) c *= 0.55;
  return Math.min(MAX_CONFIDENCE, Math.max(0, c));
}

function buildMatchNotes(args: {
  tier: Tier;
  query: string;
  used: Array<{ score: number; title: string }>;
  avgScore: number;
}): string {
  const head =
    args.tier === 'exact'
      ? 'eBay sold comps (exact query + relevance filter).'
      : 'eBay sold comps (near query; parallel/grade tokens omitted from search + relevance filter).';
  const sample = args.used
    .slice(0, 3)
    .map((u) => `${u.score}:${u.title.slice(0, 72)}${u.title.length > 72 ? '…' : ''}`)
    .join(' | ');
  return `${head} Avg relevance ${args.avgScore.toFixed(0)}/100. q="${args.query.slice(0, 120)}${args.query.length > 120 ? '…' : ''}" Samples: ${sample}`;
}

export const ebaySoldValuationProvider: ValuationProvider = {
  id: PROVIDER_ID,
  async valueCard(card) {
    const exactQ = buildExactQuery(card);
    const nearQ = buildNearQuery(card);
    if (!exactQ && !nearQ) {
      return {
        provider: PROVIDER_ID,
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
      let tier: Tier = 'near';
      let rows: ScoredSoldRow[] = [];
      let usedQuery = '';

      if (exactQ) {
        const rawExact = await fetchSoldRows(exactQ);
        const filt = filterAndScore(card, rawExact, 'exact', 52);
        if (filt.scored.length >= MIN_COMPS) {
          tier = 'exact';
          usedQuery = exactQ;
          rows = filt.scored;
        } else if (nearQ) {
          const nearRows = await fetchSoldRows(nearQ);
          const nearFilt = filterAndScore(card, nearRows, 'near', 44);
          if (nearFilt.scored.length >= MIN_COMPS) {
            tier = 'near';
            usedQuery = nearQ;
            rows = nearFilt.scored;
          } else {
            return {
              provider: PROVIDER_ID,
              status: 'unavailable',
              confidence: 0,
              match_notes: `Insufficient comparable sold listings after relevance scoring (exact ${filt.scored.length}, near ${nearFilt.scored.length}).`,
              low_cents: null,
              mid_cents: null,
              high_cents: null,
              last_comp_price_cents: null,
              last_comp_date: null,
              comp_count: filt.scored.length + nearFilt.scored.length,
            };
          }
        } else {
          return {
            provider: PROVIDER_ID,
            status: 'unavailable',
            confidence: 0,
            match_notes: `Insufficient comparable sold listings after relevance scoring (${filt.scored.length} comps, min ${MIN_COMPS}).`,
            low_cents: null,
            mid_cents: null,
            high_cents: null,
            last_comp_price_cents: null,
            last_comp_date: null,
            comp_count: filt.scored.length,
          };
        }
      } else if (nearQ) {
        const rawNearOnly = await fetchSoldRows(nearQ);
        const nearFilt = filterAndScore(card, rawNearOnly, 'near', 44);
        if (nearFilt.scored.length < MIN_COMPS) {
          return {
            provider: PROVIDER_ID,
            status: 'unavailable',
            confidence: 0,
            match_notes: `Insufficient comparable sold listings after relevance scoring (${nearFilt.scored.length}).`,
            low_cents: null,
            mid_cents: null,
            high_cents: null,
            last_comp_price_cents: null,
            last_comp_date: null,
            comp_count: nearFilt.scored.length,
          };
        }
        tier = 'near';
        usedQuery = nearQ;
        rows = nearFilt.scored;
      }

      const prices = rows.map((r) => r.priceCents);
      const worstNotes = new Set<string>();
      for (const r of rows.slice(0, 12)) {
        for (const n of r.notes) {
          if (n.includes('miss') || n.includes('conflict') || n.includes('graded')) worstNotes.add(n);
        }
      }

      const avgScore = rows.length ? rows.reduce((s, x) => s + x.score, 0) / rows.length : 0;
      const conf = confidenceFromComps({
        tier,
        count: rows.length,
        avgScore,
        worstNotes,
      });

      if (conf < MIN_CONFIDENCE_TO_PUBLISH) {
        return {
          provider: PROVIDER_ID,
          status: 'unavailable',
          confidence: 0,
          match_notes: `Relevance/confidence too low after scoring (confidence ${conf.toFixed(2)} < ${MIN_CONFIDENCE_TO_PUBLISH}). ${buildMatchNotes({
            tier,
            query: usedQuery,
            used: rows.map((r) => ({ score: r.score, title: r.title })),
            avgScore,
          })}`,
          low_cents: null,
          mid_cents: null,
          high_cents: null,
          last_comp_price_cents: null,
          last_comp_date: null,
          comp_count: rows.length,
        };
      }

      const mid = median(prices);
      const low = percentile(prices, 0.25);
      const high = percentile(prices, 0.75);

      const mostRecentComp = rows.reduce((best, r) => (r.listIndex < best.listIndex ? r : best), rows[0]!);
      const lastPrice = mostRecentComp?.priceCents ?? null;
      const lastDate = parseSoldDateHint(mostRecentComp?.soldCaption ?? null);

      return {
        provider: PROVIDER_ID,
        status: 'ok',
        confidence: conf,
        match_notes: buildMatchNotes({
          tier,
          query: usedQuery,
          used: rows.map((r) => ({ score: r.score, title: r.title })),
          avgScore,
        }),
        low_cents: low,
        mid_cents: mid,
        high_cents: high,
        last_comp_price_cents: lastPrice,
        last_comp_date: lastDate,
        comp_count: rows.length,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sold comp lookup failed.';
      return {
        provider: PROVIDER_ID,
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
