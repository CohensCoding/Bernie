/**
 * String normalization helpers for Layer 2 identity.
 *
 * Pure functions only — no DB, no I/O. Fully unit-tested.
 */

import type { Grade, Grader } from '@/lib/layer2/types';

/**
 * Lowercase, fold diacritics, replace any non-alphanumeric run with a
 * single space, collapse whitespace.
 *
 *   "Luka Dončić" → "luka doncic"
 *   "  Topps Chrome  / Refractor " → "topps chrome refractor"
 */
export function normalizeAscii(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks (diacritics)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Slug form: same as normalizeAscii but with hyphens instead of spaces.
 *
 *   "Panini Prizm" → "panini-prizm"
 *   "Luka Dončić" → "luka-doncic"
 *
 * Returns `'unknown'` for the empty case to keep slug templates stable.
 */
export function slugify(s: string): string {
  const n = normalizeAscii(s).replace(/\s+/g, '-');
  return n.length === 0 ? 'unknown' : n;
}

/**
 * Strict 4-digit year extractor. Returns the FIRST plausible year for the
 * sports-card domain (1900..current+2). Returns null if none found.
 */
const YEAR_RX = /\b(19\d{2}|20\d{2})\b/;
const CURRENT_YEAR_MAX = new Date().getUTCFullYear() + 2;
export function parseYear(s: string): number | null {
  const m = YEAR_RX.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1900 || y > CURRENT_YEAR_MAX) return null;
  return y;
}

/**
 * Recognized grader tokens, in priority order. We check substrings of the
 * normalized query, so longer / more specific tokens come first.
 */
const GRADER_TOKENS: ReadonlyArray<readonly [string, Grader]> = [
  ['beckett', 'BGS'],
  ['bgs', 'BGS'],
  ['psa', 'PSA'],
  ['sgc', 'SGC'],
  ['cgc', 'CGC'],
];

/**
 * Try to extract a `(grader, grade)` pair from a free-form string.
 *
 *   "PSA 10"     → { grader: 'PSA', grade: '10' }
 *   "BGS 9.5"    → { grader: 'BGS', grade: '9.5' }
 *   "Beckett 8"  → { grader: 'BGS', grade: '8' }
 *   "raw"        → { grader: 'RAW', grade: 'RAW' }
 *
 * Returns null if no grader+grade pattern is found.
 */
export function parseGrade(s: string): { grader: Grader; grade: Grade } | null {
  // Preserve decimals here ("9.5"); normalizeAscii would strip the dot.
  const n = s.toLowerCase().replace(/[^a-z0-9.\s]+/g, ' ').replace(/\s+/g, ' ').trim();

  // RAW handling. We accept the literal "raw" anywhere as a strong signal
  // that the card is ungraded.
  if (/\braw\b/.test(n)) return { grader: 'RAW', grade: 'RAW' };

  for (const [token, grader] of GRADER_TOKENS) {
    // Build a regex like: /\bpsa\s+(10|9(?:\.\d)?|8(?:\.\d)?|...)\b/
    // We match the grader token followed by a numeric grade with optional
    // half- or quarter-step decimals.
    const rx = new RegExp(`\\b${token}\\s+(10|[0-9](?:\\.[0-9]{1,2})?)\\b`);
    const m = rx.exec(n);
    if (m) return { grader, grade: m[1]! };
  }
  return null;
}

/**
 * Canonical query string for use as an `alias` lookup key. Idempotent.
 */
export function normalizeQuery(s: string): string {
  return normalizeAscii(s);
}

/**
 * Recognized parallel tokens for the simple regex fallback. The LLM
 * parser may extract more nuanced parallels; this list is just for fast,
 * deterministic matches on common cases.
 */
const COMMON_PARALLELS: readonly string[] = [
  'silver',
  'gold',
  'red',
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'black',
  'white',
  'rainbow',
  'mojo',
  'wave',
  'lazer',
  'shimmer',
  'cracked ice',
  'sparkle',
  'fast break',
  'choice',
  'optic',
  'refractor',
];
export function findCommonParallel(s: string): string | null {
  const n = normalizeAscii(s);
  for (const p of COMMON_PARALLELS) {
    const rx = new RegExp(`\\b${p.replace(/\s+/g, '\\s+')}\\b`);
    if (rx.test(n)) return p.replace(/\s+/g, ' ');
  }
  return null;
}
