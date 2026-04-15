/**
 * Parse eBay Trading API `Item.ItemSpecifics.NameValueList` into a flat map.
 * Keys preserve eBay labels (e.g. "Player/Athlete"); lookups should be case-insensitive.
 */
export function hasUsableItemSpecifics(specifics?: Record<string, string> | null): boolean {
  if (!specifics) return false;
  return Object.values(specifics).some((v) => String(v).trim().length > 0);
}

export function extractItemSpecificsFromItem(item: unknown): Record<string, string> {
  if (!item || typeof item !== 'object') return {};
  const rec = item as Record<string, unknown>;

  const fromContainer = (container: Record<string, unknown> | undefined): Record<string, string> => {
    if (!container) return {};
    const specs = container.ItemSpecifics as Record<string, unknown> | undefined;
    if (!specs) return {};

    const raw = specs.NameValueList;
    const lists = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    const out: Record<string, string> = {};

    for (const nv of lists) {
      if (!nv || typeof nv !== 'object') continue;
      const row = nv as Record<string, unknown>;
      const nameRaw = row.Name ?? row.name;
      const name = nameRaw != null ? String(nameRaw).trim() : '';
      if (!name) continue;
      const val = formatNvValue(row.Value ?? row.value);
      if (val) out[name] = val;
    }
    return out;
  };

  const nested =
    rec.Item && typeof rec.Item === 'object' ? fromContainer(rec.Item as Record<string, unknown>) : {};
  const direct = fromContainer(rec);
  return { ...nested, ...direct };
}

/** Recover item specifics from import `raw` payload when the purchase object omits `itemSpecifics`. */
export function extractItemSpecificsFromPurchaseRaw(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const tx = r.tx as Record<string, unknown> | undefined;
  if (!tx) return {};
  return extractItemSpecificsFromItem(tx);
}

function formatNvValue(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(', ');
  return String(v).trim();
}

export function getSpecificValue(
  specifics: Record<string, string> | undefined,
  ...nameAliases: string[]
): string | null {
  if (!specifics || !nameAliases.length) return null;
  const entries = Object.entries(specifics);
  for (const alias of nameAliases) {
    const want = normalizeKey(alias);
    for (const [k, v] of entries) {
      if (normalizeKey(k) === want && v.trim()) return v.trim();
    }
  }
  return null;
}

/** Collapses punctuation/spacing so "Player/Athlete", "Card No.", and "Card #" align with aliases. */
function normalizeKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeGradingCompany(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/professional sports authenticator|\bPSA\b/i.test(t)) return 'PSA';
  if (/beckett|\bBGS\b|bvg/i.test(t)) return 'BGS';
  if (/\bSGC\b|sportscard guaranty/i.test(t)) return 'SGC';
  if (/\bCGC\b/i.test(t)) return 'CGC';
  return t.length > 24 ? t.slice(0, 24) : t;
}

export function normalizeCardNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.trim().replace(/^#/, '').toUpperCase();
  const m = /^([A-Z]{1,5})-?(\d{2,4})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}`;
  return t || null;
}

/** Resolve card # from item specifics; key labels vary ("Card Number", "Card #", …). */
export function getCardNumberFromSpecifics(specifics: Record<string, string>): string | null {
  const direct = getSpecificValue(
    specifics,
    'Card Number',
    'Card number',
    'Card No.',
    'Card No',
    'Card #',
    'Card#',
  );
  if (direct) return normalizeCardNumber(direct);

  for (const [k, v] of Object.entries(specifics)) {
    const t = v.trim();
    if (!t) continue;
    const nk = k.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (nk.includes('cardnumber') || nk.includes('cardno')) return normalizeCardNumber(t);
    if (nk === 'card' && /^[#]?[A-Z0-9-]+$/i.test(t)) return normalizeCardNumber(t);
  }
  return null;
}

/** eBay label is usually "Parallel/Variety"; tolerate spacing variants. */
export function getParallelVarietyFromSpecifics(specifics: Record<string, string>): string | null {
  const direct = getSpecificValue(specifics, 'Parallel/Variety', 'Parallel / Variety');
  if (direct) return direct.trim();
  for (const [k, v] of Object.entries(specifics)) {
    const t = v.trim();
    if (!t) continue;
    const nk = k.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (nk.includes('parallel') && nk.includes('variety')) return t;
  }
  return null;
}
