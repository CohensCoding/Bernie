import {
  getCardNumberFromSpecifics,
  getParallelVarietyFromSpecifics,
  getSpecificValue,
  hasUsableItemSpecifics,
  normalizeCardNumber,
  normalizeGradingCompany,
} from '@/lib/ebay/purchases/itemSpecifics';

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
};

const BRAND_RE =
  /\b(TOPPS|PANINI|BOWMAN|DONRUSS|PRIZM|MOSAIC|LEAF|UPPER DECK|SCORE|FLEER|WILD CARD)\b/i;

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
    return { ...base, player_hint: basePlayer };
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

  const player_hint = sanitizePlayerName(
    playerFromSpec ? toDisplayName(playerFromSpec) : basePlayer,
  );

  const team_hint = teamFromSpec ? toDisplayName(teamFromSpec.trim()) : base.team_hint;
  const sport_hint = sportFromSpec ?? sportFromLeague ?? base.sport_hint;
  const brand = manufacturerFromSpec ? titleCaseWord(manufacturerFromSpec.trim()) : base.brand;
  const set_hint = setFromSpec ? setFromSpec.trim() : base.set_hint;
  const parallel_hint = parallelFromSpec?.trim() ? parallelFromSpec.trim() : base.parallel_hint;
  const card_number_hint = cardFromSpec ?? base.card_number_hint;

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
  const t = title ?? '';
  const upper = t.toUpperCase();

  const yearMatch = /\b(19[7-9]\d|20[0-3]\d)\b/.exec(t);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const auto = /\b(AUTO|AUTOGRAPH)\b/i.test(t);
  const patch = /\b(PATCH|MEMORABILIA|RELIC)\b/i.test(t);
  const rookie = /\b(ROOKIE|RC)\b/i.test(t);

  const gradingCompanies = ['PSA', 'BGS', 'SGC', 'CGC'] as const;
  const company = gradingCompanies.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(upper)) ?? null;

  const gradeMatch = company ? new RegExp(`\\b${company}\\s*([0-9]{1,2}(?:\\.[0-9])?)\\b`, 'i').exec(t) : null;
  const grade = gradeMatch ? gradeMatch[1] : null;

  const graded = Boolean(company || /\bGRADED\b/i.test(t));

  const brandMatch = BRAND_RE.exec(t);
  const brand = brandMatch ? titleCaseWord(brandMatch[1]) : null;

  const card_number_hint = extractCardNumberFromTitle(t);

  const { core, trailingTeamCandidate } = stripGradingSuffixForParsing(t);
  let coreForPlayer = core.replace(/#\s*[A-Z]{1,5}-?\d{2,4}\b/gi, ' ').replace(/\s+/g, ' ').trim();

  const team_hint = pickTeamHint(trailingTeamCandidate, coreForPlayer, t);
  const player_hint = extractPlayerHint(coreForPlayer, year);
  const sport_hint = inferSportFromTitle(t);
  const set_hint = inferSetHint(t);
  const parallel_hint = inferParallelHint(t);

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
  };
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
