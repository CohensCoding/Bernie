export type LightParsed = {
  year: number | null;
  graded: boolean;
  grading_company: string | null;
  grade: string | null;
  auto: boolean;
  patch: boolean;
  /** Best-effort from title only — user should verify. */
  brand: string | null;
  set_hint: string | null;
  team_hint: string | null;
  player_hint: string | null;
};

export function lightParseTitle(title: string): LightParsed {
  const t = title ?? '';
  const upper = t.toUpperCase();

  const yearMatch = /\b(19[7-9]\d|20[0-2]\d)\b/.exec(t);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const auto = /\b(AUTO|AUTOGRAPH)\b/i.test(t);
  const patch = /\b(PATCH|MEMORABILIA|RELIC)\b/i.test(t);

  const gradingCompanies = ['PSA', 'BGS', 'SGC', 'CGC'];
  const company = gradingCompanies.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(upper)) ?? null;

  const gradeMatch = company ? new RegExp(`\\b${company}\\s*([0-9]{1,2}(?:\\.[0-9])?)\\b`, 'i').exec(t) : null;
  const grade = gradeMatch ? gradeMatch[1] : null;

  const graded = Boolean(company || /\bGRADED\b/i.test(t));

  const brandMatch = /\b(TOPPS|PANINI|BOWMAN|DONRUSS|PRIZM|MOSAIC|LEAF|UPPER DECK|SCORE|FLEER|WILD CARD)\b/i.exec(
    t,
  );
  const brand = brandMatch ? titleCaseWord(brandMatch[1]) : null;

  let set_hint: string | null = null;
  if (/\bPROJECT\s*70\b/i.test(t)) set_hint = 'Project 70';
  else if (/\bBOWMAN\s+CHROME\b/i.test(t)) set_hint = 'Bowman Chrome';
  else if (/\bABSOLUTE\s+FOOTBALL\b/i.test(t)) set_hint = 'Absolute Football';
  else if (/\bTOPPS\s+PRISTINE\b/i.test(t)) set_hint = 'Topps Pristine';

  let team_hint: string | null = null;
  let player_hint: string | null = null;
  const dashParts = t.split(/\s*-\s*/).map((s) => s.trim());
  if (dashParts.length >= 2) {
    team_hint = dashParts[dashParts.length - 1] ?? null;
    const left = dashParts.slice(0, -1).join(' - ');
    const afterHash = /#\d+\s+(.+)/i.exec(left);
    const candidate = (afterHash ? afterHash[1] : left).trim();
    const noYearPrefix = candidate.replace(/^\d{4}\s+/, '').trim();
    const words = noYearPrefix.split(/\s+/).filter(Boolean);
    const junk = new Set(['TOPPS', 'PANINI', 'BOWMAN', 'PROJECT', '70', 'CHROME', 'SAPPHIRE', 'ROOKIE', 'RC']);
    const nameWords = words.filter((w) => !/^\d+$/.test(w) && !junk.has(w.toUpperCase()));
    if (nameWords.length >= 1) {
      player_hint = nameWords.slice(-4).join(' ');
    }
  }

  return {
    year,
    graded,
    grading_company: company,
    grade,
    auto,
    patch,
    brand,
    set_hint,
    team_hint,
    player_hint,
  };
}

function titleCaseWord(s: string) {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
