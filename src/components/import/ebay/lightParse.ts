type LightParsed = {
  year: number | null;
  graded: boolean;
  grading_company: string | null;
  grade: string | null;
  auto: boolean;
  patch: boolean;
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

  // Common grade patterns: PSA 10, BGS 9.5, SGC 10, etc.
  const gradeMatch = company ? new RegExp(`\\b${company}\\s*([0-9]{1,2}(?:\\.[0-9])?)\\b`, 'i').exec(t) : null;
  const grade = gradeMatch ? gradeMatch[1] : null;

  const graded = Boolean(company || /\bGRADED\b/i.test(t));

  return {
    year,
    graded,
    grading_company: company,
    grade,
    auto,
    patch,
  };
}

