import {
  getCardNumberFromSpecifics,
  getParallelVarietyFromSpecifics,
  getSpecificValue,
  hasUsableItemSpecifics,
  normalizeCardNumber,
  normalizeGradingCompany,
} from '@/lib/ebay/purchases/itemSpecifics';
import { FULL_TEAM_NAMES_SORTED, inferSportFromTeamSubstring, sportForKnownTeam } from '@/components/import/ebay/knownTeams';

export type LightParsed = {
  year: number | null;
  graded: boolean;
  grading_company: string | null;
  grade: string | null;
  auto: boolean;
  patch: boolean;
  rookie: boolean;
  /** Best-effort from title + item specifics — user should verify. */
  brand: string | null;
  set_hint: string | null;
  team_hint: string | null;
  player_hint: string | null;
  sport_hint: string | null;
  parallel_hint: string | null;
  card_number_hint: string | null;
  /** From patterns like "5/99" at end of title (denominator → print run). */
  print_run_hint: number | null;
  /** Numerator from "5/99" when present. */
  serial_number_hint: number | null;
};

const BRAND_ALT =
  'TOPPS|PANINI|BOWMAN|DONRUSS|PRIZM|MOSAIC|LEAF|UPPER DECK|SCORE|FLEER|WILD CARD';
/** Word-boundary match (may match mid-title). */
const BRAND_RE = new RegExp(`\\b(${BRAND_ALT})\\b`, 'i');
/** Start-anchored match so BOM/NBSP or `\b` quirks cannot shift `index` away from 0. */
const BRAND_LEADING_RE = new RegExp(`^\\s*(${BRAND_ALT})\\b`, 'i');

const PLAYER_STOP_RE =
  /\s+(?:1ST|FIRST|ON[-\s]?CARD|ROOKIE|RC)\b|\s+(?:BOWMAN|TOPPS|PANINI|DONRUSS|PRIZM|MOSAIC|LEAF|SCORE|FLEER)\b|\s*#/i;

/** Strip common listing-noise suffixes (1st Bowman, partial #BCP, etc.) before display or save. */
export function sanitizePlayerName(s: string | null | undefined): string | null {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t) return null;
  for (let i = 0; i < 8; i++) {
    const next = t
      .replace(/\s*#\s*[A-Z0-9-]{0,20}\s*$/gi, '')
      .replace(/\s+(?:1ST|FIRST)\s*$/i, '')
      .replace(/\s+BCP\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (next === t) break;
    t = next;
  }
  t = t.replace(/^(?:1ST|FIRST)\s+/i, '').trim();
  return t || null;
}

/**
 * When item specifics exist, each known field comes from specifics only (no title merge for that field).
 * Title parsing fills gaps when a specific field is missing.
 */
export function mergeTitleAndItemSpecifics(
  title: string,
  itemSpecifics?: Record<string, string> | null,
): LightParsed {
  const base = lightParseTitle(title);
  const basePlayer = sanitizePlayerName(base.player_hint);

  if (!hasUsableItemSpecifics(itemSpecifics)) {
    let ph = basePlayer;
    if (looksLikeTitlePollutedPlayer(ph)) ph = null;
    return { ...base, player_hint: ph };
  }

  const specifics = itemSpecifics!;

  const playerFromSpec = getSpecificValue(
    specifics,
    'Player/Athlete',
    'Player / Athlete',
    'Player',
    'Athlete',
  );
  const teamFromSpec = getSpecificValue(specifics, 'Team');
  const sportFromSpec = getSpecificValue(specifics, 'Sport');
  const leagueSpec = getSpecificValue(specifics, 'League');
  const manufacturerFromSpec = getSpecificValue(specifics, 'Manufacturer', 'Brand');
  const setFromSpec = getSpecificValue(specifics, 'Set', 'Card Set');
  const season = getSpecificValue(specifics, 'Season', 'Year');
  const parallelFromSpec = getParallelVarietyFromSpecifics(specifics);
  const cardFromSpec = getCardNumberFromSpecifics(specifics);
  const graderFromSpec = getSpecificValue(specifics, 'Professional Grader', 'Grading company', 'Grader');
  const gradeFromSpecRaw = getSpecificValue(specifics, 'Grade', 'Card Grade');
  const features = getSpecificValue(specifics, 'Features');
  const typeSpec = getSpecificValue(specifics, 'Type');
  const condition = getSpecificValue(specifics, 'Condition');

  const graderNorm = graderFromSpec ? normalizeGradingCompany(graderFromSpec) : null;
  const gradeFromSpec = gradeFromSpecRaw ? extractGradeDigits(gradeFromSpecRaw) : null;
  const fromCondition = parseGradingFromCondition(condition);

  const grading_company = graderNorm ?? fromCondition.company ?? base.grading_company;
  const grade = gradeFromSpec ?? fromCondition.grade ?? base.grade;

  let year = base.year;
  const seasonYear = season && /\b(19[7-9]\d|20[0-3]\d)\b/.exec(season);
  if (seasonYear) year = Number(seasonYear[1]);
  else if (setFromSpec) {
    const ym = /\b(19[7-9]\d|20[0-3]\d)\b/.exec(setFromSpec);
    if (ym) year = Number(ym[1]);
  }

  const sportFromLeague = inferSportFromLeague(leagueSpec);

  const useSpecPlayer =
    playerFromSpec &&
    !specificsPlayerLooksPolluted(playerFromSpec, title) &&
    !looksLikeTitlePollutedPlayer(playerFromSpec);
  let player_hint = sanitizePlayerName(
    useSpecPlayer ? toDisplayName(playerFromSpec) : basePlayer,
  );
  if (looksLikeTitlePollutedPlayer(player_hint)) player_hint = null;

  const teamFromTitle = base.team_hint ? toDisplayName(base.team_hint) : null;
  let team_hint = teamFromSpec ? toDisplayName(teamFromSpec.trim()) : teamFromTitle;
  if (teamFromSpec && teamFromTitle && teamsStronglyConflict(teamFromSpec, teamFromTitle)) {
    // Prefer blank over wrong when title and specifics strongly disagree.
    team_hint = null;
  }
  const sport_hint =
    sportFromSpec ??
    sportFromLeague ??
    base.sport_hint ??
    sportForKnownTeam(team_hint) ??
    inferSportFromTeamSubstring(title) ??
    inferSportFromIdCues(title);
  const brand = manufacturerFromSpec ? titleCaseWord(manufacturerFromSpec.trim()) : base.brand;
  const set_hint = setFromSpec ? setFromSpec.trim() : base.set_hint;
  const parallel_hint = parallelFromSpec?.trim() ? parallelFromSpec.trim() : base.parallel_hint;
  const card_number_hint = cardFromSpec ?? base.card_number_hint;

  const printRunSpec = getSpecificValue(specifics, 'Print Run', 'Print run');
  const fracFromSpec = parseSlashFractionFromString(printRunSpec);
  const print_run_hint = fracFromSpec != null ? fracFromSpec.denom : base.print_run_hint;
  const serial_number_hint = fracFromSpec != null ? fracFromSpec.serial : base.serial_number_hint;

  let rookie = base.rookie;
  if (features && /\brookie\b/i.test(features)) rookie = true;
  if (typeSpec && /\brookie\b/i.test(typeSpec)) rookie = true;

  const graded = Boolean(
    grading_company ||
      grade ||
      /\bgraded\b/i.test(condition ?? '') ||
      base.graded,
  );

  return {
    ...base,
    year,
    graded,
    grading_company,
    grade,
    rookie,
    brand,
    set_hint,
    team_hint,
    player_hint,
    sport_hint,
    parallel_hint,
    card_number_hint,
    print_run_hint,
    serial_number_hint,
  };
}

function parseGradingFromCondition(condition: string | null | undefined): {
  company: string | null;
  grade: string | null;
} {
  if (!condition) return { company: null, grade: null };
  const m = /\b(PSA|BGS|SGC|CGC)\s*(\d{1,2}(?:\.\d)?)\b/i.exec(condition);
  if (!m) return { company: null, grade: null };
  return {
    company: normalizeGradingCompany(m[1]) ?? m[1].toUpperCase(),
    grade: m[2],
  };
}

export function lightParseTitle(title: string): LightParsed {
  const t = normalizeListingTitle(title ?? '');
  const upper = t.toUpperCase();

  const auto = /\b(AUTO|AUTOGRAPH)\b/i.test(t);
  const patch = /\b(PATCH|MEMORABILIA|RELIC)\b/i.test(t);
  const rookie = /\b(ROOKIE|RC)\b/i.test(t);

  const gradingCompanies = ['PSA', 'BGS', 'SGC', 'CGC'] as const;
  const company = gradingCompanies.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(upper)) ?? null;

  const gradeMatch = company ? new RegExp(`\\b${company}\\s*([0-9]{1,2}(?:\\.[0-9])?)\\b`, 'i').exec(t) : null;
  const grade = gradeMatch ? gradeMatch[1] : null;

  const graded = Boolean(company || /\bGRADED\b/i.test(t));

  const { core, trailingTeamCandidate } = stripGradingSuffixForParsing(t);
  const card_number_hint = extractCardNumberFromTitle(core);

  const teamRawCanon = extractKnownTeamFromEnd(core) ?? fallbackTeamFromEnd(core);
  let stripped = core
    .trim()
    .replace(/#\s*\d{1,4}\b/gi, ' ')
    .replace(/#\s*[A-Z]{1,5}-?\d{2,4}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (teamRawCanon) {
    stripped = stripped.replace(new RegExp(`\\s+${escapeRe(teamRawCanon)}\\s*$`, 'i'), '').trim();
  }

  const peelYearFirst = peelYearManufacturerProductAndParallel(stripped);
  if (peelYearFirst) {
    const team_hint =
      (teamRawCanon ? toDisplayName(teamRawCanon) : null) ??
      pickTeamHint(trailingTeamCandidate, peelYearFirst.rest, core);
    const frac = extractSerialFractionFromTitle(core);
    let player_hint =
      sanitizePlayerName(extractPlayerFromRemainder(peelYearFirst.rest)) ??
      sanitizePlayerName(extractPlayerHint(peelYearFirst.rest, peelYearFirst.year));
    if (looksLikeTitlePollutedPlayer(player_hint)) player_hint = null;
    const sport_hint =
      inferSportFromTitle(t) ??
      sportForKnownTeam(teamRawCanon) ??
      sportForKnownTeam(team_hint) ??
      inferSportFromTeamSubstring(core);
    const parallel_hint = peelYearFirst.parallelColor ?? inferParallelHint(t);

    return {
      year: peelYearFirst.year,
      graded,
      grading_company: company,
      grade,
      auto,
      patch,
      rookie,
      brand: titleCaseWord(peelYearFirst.manufacturer),
      set_hint: peelYearFirst.setLabel,
      team_hint,
      player_hint,
      sport_hint,
      parallel_hint,
      card_number_hint,
      print_run_hint: frac?.denom ?? null,
      serial_number_hint: frac?.serial ?? null,
    };
  }

  const structured = tryParseBrandLeadingTitle(stripped, core, teamRawCanon);
  if (structured) {
    const team_hint =
      (teamRawCanon ? toDisplayName(teamRawCanon) : null) ??
      pickTeamHint(trailingTeamCandidate, stripped, core);
    let player_hint = structured.player_hint;
    if (looksLikeTitlePollutedPlayer(player_hint)) player_hint = null;
    const sport_hint =
      structured.sport_hint ??
      inferSportFromTitle(t) ??
      sportForKnownTeam(teamRawCanon) ??
      sportForKnownTeam(team_hint) ??
      inferSportFromTeamSubstring(core) ??
      inferSportFromIdCues(core);
    const set_hint = structured.set_hint ?? inferSetHint(t) ?? inferSeasonProductSetHint(t);
    const parallel_hint = inferParallelHint(t);
    const frac = extractSerialFractionFromTitle(core);

    return {
      year: structured.year,
      graded,
      grading_company: company,
      grade,
      auto,
      patch,
      rookie,
      brand: structured.brand,
      set_hint,
      team_hint,
      player_hint,
      sport_hint,
      parallel_hint,
      card_number_hint,
      print_run_hint: frac?.denom ?? null,
      serial_number_hint: frac?.serial ?? null,
    };
  }

  const year = extractPrimaryYear(t);
  const brandMatch = BRAND_RE.exec(t);
  const brand = brandMatch ? titleCaseWord(brandMatch[1]) : null;

  let coreForPlayer = core
    .replace(/#\s*\d{1,4}\b/gi, ' ')
    .replace(/#\s*[A-Z]{1,5}-?\d{2,4}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  coreForPlayer = stripBrandAndSetPrefixForLegacyPlayer(coreForPlayer);

  const team_hint =
    (teamRawCanon ? toDisplayName(teamRawCanon) : null) ??
    pickTeamHint(trailingTeamCandidate, coreForPlayer, t);
  let player_hint = sanitizePlayerName(extractPlayerHint(coreForPlayer, year));
  if (looksLikeTitlePollutedPlayer(player_hint)) player_hint = null;
  const sport_hint =
    inferSportFromTitle(t) ??
    sportForKnownTeam(teamRawCanon) ??
    sportForKnownTeam(team_hint) ??
    inferSportFromTeamSubstring(core) ??
    inferSportFromIdCues(core);
  const set_hint = inferSetHint(t) ?? inferSeasonProductSetHint(t);
  const parallel_hint = inferParallelHint(t);
  const frac = extractSerialFractionFromTitle(core);

  return {
    year,
    graded,
    grading_company: company,
    grade,
    auto,
    patch,
    rookie,
    brand,
    set_hint,
    team_hint,
    player_hint,
    sport_hint,
    parallel_hint,
    card_number_hint,
    print_run_hint: frac?.denom ?? null,
    serial_number_hint: frac?.serial ?? null,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeListingTitle(s: string): string {
  return s
    .replace(/\uFEFF/g, '')
    .replace(/[\u00A0\u2000-\u200B]/g, ' ')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a saved player string still looks like listing metadata, not a person name. */
function looksLikeTitlePollutedPlayer(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const n = String(name).trim();
  if (BRAND_LEADING_RE.test(n)) return true;
  if (/\b20\d{2}-\d{2,4}\b/.test(n)) return true;
  const wc = n.split(/\s+/).length;
  if (wc >= 4 && /\b(Chrome|Prizm|Select|Mosaic|Sapphire|Bowman|Donruss|Flawless|Optic)\b/i.test(n)) return true;
  return false;
}

function specificsPlayerLooksPolluted(specPlayer: string, title: string): boolean {
  const p = specPlayer.trim();
  const tl = title.trim().toLowerCase();
  if (!p) return true;
  if (looksLikeTitlePollutedPlayer(p)) return true;
  const head = p.slice(0, Math.min(28, p.length)).toLowerCase();
  if (head.length >= 8 && tl.startsWith(head)) return true;
  return false;
}

function stripBrandAndSetPrefixForLegacyPlayer(s: string): string {
  let t = normalizeListingTitle(s);
  const peel = peelYearManufacturerProductAndParallel(t);
  if (peel) return peel.rest;
  const bl = BRAND_LEADING_RE.exec(t);
  if (bl) t = t.slice(bl[0].length).trim();
  const sr = extractSetLinePrefix(t);
  if (sr) t = sr.rest;
  return t;
}

/** Last "a/b" fraction in title (e.g. serial 5 of 5). */
function extractSerialFractionFromTitle(title: string): { serial: number; denom: number } | null {
  const re = /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) last = m;
  if (!last) return null;
  const serial = Number(last[1]);
  const denom = Number(last[2]);
  if (!Number.isFinite(serial) || !Number.isFinite(denom) || denom <= 0 || serial < 0) return null;
  return { serial, denom };
}

/** Parse eBay-style "5/5" or "12/99" from item specifics text. */
export function parseSlashFractionFromString(raw: string | null | undefined): { serial: number; denom: number } | null {
  if (!raw) return null;
  const t = String(raw).trim();
  const m = /^(\d{1,4})\s*\/\s*(\d{1,4})\b/.exec(t) ?? /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/.exec(t);
  if (!m) return null;
  const serial = Number(m[1]);
  const denom = Number(m[2]);
  if (!Number.isFinite(serial) || !Number.isFinite(denom) || denom <= 0) return null;
  return { serial, denom };
}

/**
 * `YYYY Manufacturer Product [ParallelColor] Player…` (common Panini/Topps listings).
 * Does not match year-first Bowman-only lines; those use `extractSetLinePrefix` after stripping.
 */
function peelYearManufacturerProductAndParallel(s: string): {
  year: number;
  manufacturer: string;
  product: string;
  parallelColor: string | null;
  setLabel: string;
  rest: string;
} | null {
  const norm = normalizeListingTitle(s);
  const re =
    /^((?:19|20)\d{2})\s+(Panini|Topps|Bowman|Donruss|Leaf|Fleer|Score)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)(?:\s+(Green|Gold|Blue|Red|Silver|Orange|Purple|Yellow|Black|Platinum|Ruby|Sapphire|Grass|Ice|Pink|Lava|Shimmer|Teal|Aqua|Neon|Wave|Cosmic))?(?=\s+[A-Z])/i;
  const m = re.exec(norm);
  if (!m) return null;
  const rest = norm.slice(m[0].length).trim();
  if (rest.length < 2) return null;
  const year = Number(m[1]);
  const manufacturer = m[2];
  const product = m[3].trim();
  const parallelColor = m[4] ?? null;
  const setLabel = `${m[1]} ${manufacturer} ${product}`.replace(/\s+/g, ' ');
  return { year, manufacturer, product, parallelColor, setLabel, rest };
}

function extractPrimaryYear(t: string): number | null {
  const range = /\b(20[0-3]\d)-(?:\d{2,4})\b/.exec(t);
  if (range) return Number(range[1]);
  const ym = /\b(19[7-9]\d|20[0-3]\d)\b/.exec(t);
  return ym ? Number(ym[1]) : null;
}

function extractKnownTeamFromEnd(title: string): string | null {
  const trimmed = title.trim();
  for (const team of FULL_TEAM_NAMES_SORTED) {
    if (new RegExp(`${escapeRe(team)}\\s*$`, 'i').test(trimmed)) return team;
  }
  return null;
}

const TEAM_FALLBACK_STOP = new Set([
  'card',
  'base',
  'set',
  'rookie',
  'chrome',
  'sapphire',
  'refractor',
  'prizm',
  'patch',
  'auto',
  'gem',
  'mt',
  'psa',
  'raw',
  'insert',
  'parallel',
  'relic',
  'numbered',
  'ser',
  'sp',
  'ssp',
  'nft',
  'trading',
  'edition',
  'prospect',
  'prospects',
  'choice',
]);

function fallbackTeamFromEnd(title: string): string | null {
  const parts = title.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const w1 = parts[parts.length - 2];
  const w2 = parts[parts.length - 1];
  if (w1.length < 2 || w2.length < 2) return null;
  if (!/^[A-Za-z.'-]+$/.test(w1) || !/^[A-Za-z.'-]+$/.test(w2)) return null;
  if (TEAM_FALLBACK_STOP.has(w1.toLowerCase()) || TEAM_FALLBACK_STOP.has(w2.toLowerCase())) return null;
  if (/^\d+$/.test(w1)) return null;
  return `${w1} ${w2}`;
}

function extractSetLinePrefix(s: string): { set: string; rest: string } | null {
  const m1 = /^((?:19|20)\d{2}-\d{2,4})\s+(Chrome|Prizm|Select|Mosaic|Optic|Finest|Merlin)\b(?=\s+[A-Za-z])/i.exec(
    s,
  );
  if (m1) return { set: `${m1[1]} ${m1[2]}`, rest: s.slice(m1[0].length).trim() };

  const mPanini =
    /^((?:19|20)\d{2})\s+(Panini|Topps)\s+(Flawless|Select|Prizm|Mosaic|Obsidian|Contenders|Absolute|Phoenix)\b(?=\s+[A-Za-z])/i.exec(
      s,
    );
  if (mPanini) return { set: mPanini[0].trim(), rest: s.slice(mPanini[0].length).trim() };

  const m2 =
    /^((?:19|20)\d{2})\s+(Bowman(?:\s+Chrome)?|Donruss(?:\s+Optic)?|Flawless|Absolute|Contenders|National\s+Treasures|Obsidian|Phoenix)\b(?=\s+[A-Za-z])/i.exec(
      s,
    );
  if (m2) return { set: m2[0].trim(), rest: s.slice(m2[0].length).trim() };

  const m3 = /^((?:19|20)\d{2})\s+(Chrome|Prizm)\b(?=\s+[A-Za-z])/i.exec(s);
  if (m3) return { set: `${m3[1]} ${m3[2]}`, rest: s.slice(m3[0].length).trim() };

  const m0 = /^((?:19|20)\d{2}(?:-\d{2,4})?)\s+([A-Za-z]{2,24})\b(?=\s+[A-Za-z])/i.exec(s);
  if (m0 && /^(Chrome|Prizm|Select|Mosaic|Optic|Bowman|Donruss|Score|Finest)$/i.test(m0[2])) {
    return { set: `${m0[1]} ${m0[2]}`, rest: s.slice(m0[0].length).trim() };
  }

  return null;
}

function extractPlayerFromRemainder(s: string): string | null {
  let head =
    s.split(/\s+(?:Rookie|\bRC\b|Base\b|Set\b|Card\b|Insert|Parallel|Patch|Auto|On[-\s]?Card|Serial)\b/i)[0]?.trim() ??
    '';
  if (!head) return null;
  head = head.replace(/\s+\d{1,4}\s*\/\s*\d{1,4}\s*$/g, '').trim();
  let out = head.replace(/\b\d{1,4}\b$/g, '').trim();
  out = out.replace(/\s+#\s*$/g, '').trim();
  return out || null;
}

function tryParseBrandLeadingTitle(
  stripped: string,
  origCore: string,
  teamCanon: string | null,
): Pick<LightParsed, 'player_hint' | 'set_hint' | 'brand' | 'year' | 'sport_hint'> | null {
  const normStripped = normalizeListingTitle(stripped);
  const brandLead = BRAND_LEADING_RE.exec(normStripped);
  if (!brandLead) return null;

  const brand = titleCaseWord(brandLead[1]);
  let rest = normStripped.slice(brandLead[0].length).trim();

  const setResult = extractSetLinePrefix(rest);
  let set_hint: string | null = null;
  if (setResult) {
    set_hint = setResult.set;
    rest = setResult.rest;
  } else if (/\bPROJECT\s*70\b/i.test(rest)) {
    return null;
  } else if (/^(Chrome|Prizm|Bowman|Select|Mosaic)\b/i.test(rest)) {
    return null;
  }

  const player_raw = extractPlayerFromRemainder(rest);
  const player_hint = sanitizePlayerName(player_raw);
  if (!player_hint || player_hint.replace(/\s/g, '').length < 3) return null;

  const year = extractPrimaryYear(stripped);
  const sport_hint =
    inferSportFromTeamSubstring(origCore) ?? sportForKnownTeam(teamCanon) ?? null;

  return { player_hint, set_hint, brand, year, sport_hint };
}

function inferSeasonProductSetHint(t: string): string | null {
  const m = /\b((?:19|20)\d{2}-\d{2,4})\s+(Chrome|Prizm|Select|Mosaic|Optic)\b/i.exec(t);
  if (m) return `${m[1]} ${m[2]}`;
  return null;
}

function extractGradeDigits(s: string): string | null {
  const m = /\b(\d{1,2}(?:\.\d)?)\b/.exec(s.trim());
  return m ? m[1] : null;
}

function stripGradingSuffixForParsing(title: string): { core: string; trailingTeamCandidate: string | null } {
  const m = /,\s*(PSA|BGS|SGC|CGC)\s*([\d.]+)\s*(.*)$/i.exec(title.trim());
  if (m) {
    const rest = (m[3] ?? '').trim();
    const core = title.slice(0, m.index).trim();
    const teamCand =
      rest.length > 0 && !/^(GEM|MT|NM|MINT|PRISTINE|BLACK\s*LABEL)/i.test(rest) ? rest : null;
    return { core, trailingTeamCandidate: teamCand };
  }
  return { core: title.trim(), trailingTeamCandidate: null };
}

function isGarbageTeam(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t) return true;
  if (/^\d/.test(t)) return true;
  if (/\bPSA\b|\bBGS\b|\bSGC\b|\bCGC\b/i.test(t)) return true;
  if (/^[\d,.\s]+$/.test(t)) return true;
  if (/GEM\s*MT|PRISTINE|BLACK\s*LABEL/i.test(t)) return true;
  return false;
}

function pickTeamHint(
  trailingTeamCandidate: string | null,
  coreForPlayer: string,
  fullTitle: string,
): string | null {
  if (!isGarbageTeam(trailingTeamCandidate)) {
    return toDisplayName(trailingTeamCandidate!.trim());
  }
  const m = /\b(vs\.?|@)\s+([A-Za-z][A-Za-z\s'.-]{2,40})$/i.exec(coreForPlayer);
  if (m && !isGarbageTeam(m[2])) return toDisplayName(m[2].trim());
  const m2 = /\(([^)]{3,40})\)\s*$/.exec(fullTitle);
  if (m2 && !isGarbageTeam(m2[1])) return toDisplayName(m2[1].trim());
  return null;
}

function extractPlayerHint(coreForPlayer: string, year: number | null): string | null {
  let s = coreForPlayer.trim();
  if (year != null) s = s.replace(new RegExp(`^${year}\\s+`), '').trim();
  const m1 = /^(.+?)\s+(?:1ST|FIRST)\b/i.exec(s);
  if (m1) return toDisplayName(cleanPlayerFragment(m1[1]));
  const m2 = /^(.+?)\s+(?:ROOKIE|\bRC\b)\b/i.exec(s);
  if (m2) return toDisplayName(cleanPlayerFragment(m2[1]));
  const m3 = s.split(PLAYER_STOP_RE)[0]?.trim() ?? '';
  if (m3.length >= 2) return toDisplayName(cleanPlayerFragment(m3));
  return null;
}

function cleanPlayerFragment(s: string): string {
  return s
    .replace(/#\s*[A-Z0-9-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCardNumberFromTitle(title: string): string | null {
  const h1 = /#\s*([A-Z]{1,5})\s*-\s*(\d{2,4})\b/i.exec(title);
  if (h1) return normalizeCardNumber(`${h1[1]}-${h1[2]}`);
  const h2 = /#\s*([A-Z]{1,5})(\d{3,4})\b/i.exec(title);
  if (h2) return normalizeCardNumber(`${h2[1]}-${h2[2]}`);
  const h3 = /\b([A-Z]{1,5})-(\d{2,4})\b/i.exec(title);
  if (h3) return normalizeCardNumber(`${h3[1]}-${h3[2]}`);
  const hNum = /#\s*(\d{2,4})\b/.exec(title);
  if (hNum) return normalizeCardNumber(hNum[1]);
  return null;
}

function inferSportFromLeague(league: string | null): string | null {
  if (!league) return null;
  const u = league.toUpperCase();
  if (/\bMLB\b|MAJOR\s+LEAGUE/.test(u)) return 'Baseball';
  if (/\bNBA\b|NATIONAL\s+BASKETBALL/.test(u)) return 'Basketball';
  if (/\bNFL\b|NATIONAL\s+FOOTBALL/.test(u)) return 'Football';
  if (/\bNHL\b|NATIONAL\s+HOCKEY/.test(u)) return 'Hockey';
  if (/\bMLS\b|MAJOR\s+LEAGUE\s+SOCCER/.test(u)) return 'Soccer';
  return null;
}

function inferSportFromTitle(t: string): string | null {
  const u = t.toUpperCase();
  if (/\bBASEBALL\b|\bMLB\b/.test(u)) return 'Baseball';
  if (/\bBASKETBALL\b|\bNBA\b|\bWNBA\b/.test(u)) return 'Basketball';
  if (/\bFOOTBALL\b|\bNFL\b|\bCFB\b|\bNCAA\s+FOOTBALL\b/.test(u)) return 'Football';
  if (/\bHOCKEY\b|\bNHL\b/.test(u)) return 'Hockey';
  if (/\bSOCCER\b|\bMLS\b|\bFIFA\b|\bUEFA\b|\bPREMIER\s+LEAGUE\b/.test(u)) return 'Soccer';
  return null;
}

function inferSportFromIdCues(t: string): string | null {
  // Conservative: only use strong card-number cues when sport is otherwise missing.
  if (/\bBCP-?\d{2,4}\b/i.test(t)) return 'Baseball';
  return null;
}

function teamsStronglyConflict(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  return true;
}

function normalizeTeamName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferSetHint(t: string): string | null {
  if (/\bPROJECT\s*70\b/i.test(t)) return 'Project 70';
  if (/\bBOWMAN\b/i.test(t) && /\bSAPPHIRE\b/i.test(t)) {
    if (/\bCHROME\b/i.test(t)) return 'Bowman Chrome Sapphire';
    return 'Bowman Sapphire';
  }
  if (/\bBOWMAN\s+CHROME\b/i.test(t)) return 'Bowman Chrome';
  if (/\bABSOLUTE\s+FOOTBALL\b/i.test(t)) return 'Absolute Football';
  if (/\bTOPPS\s+PRISTINE\b/i.test(t)) return 'Topps Pristine';
  return null;
}

function inferParallelHint(t: string): string | null {
  if (/\bCHROME\b/i.test(t) && /\bSAPPHIRE\b/i.test(t)) return 'Chrome Sapphire';
  if (/\bSAPPHIRE\b/i.test(t)) return 'Sapphire';
  return null;
}

function titleCaseWord(s: string) {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function toDisplayName(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if (t === t.toUpperCase() && /[A-Z]{2,}/.test(t)) {
    return t
      .split(/\s+/)
      .map((w) => (w.length ? w.charAt(0) + w.slice(1).toLowerCase() : w))
      .join(' ');
  }
  return t;
}
