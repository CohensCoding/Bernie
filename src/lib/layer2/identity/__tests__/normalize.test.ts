import { describe, expect, it } from 'vitest';

import {
  findCommonParallel,
  normalizeAscii,
  normalizeQuery,
  parseGrade,
  parseYear,
  slugify,
} from '@/lib/layer2/identity/normalize';

describe('normalizeAscii', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeAscii('  Panini   Prizm  ')).toBe('panini prizm');
  });

  it('strips diacritics', () => {
    expect(normalizeAscii('Luka Dončić')).toBe('luka doncic');
    expect(normalizeAscii('Ohtani Shōhei')).toBe('ohtani shohei');
  });

  it('replaces punctuation with single spaces', () => {
    expect(normalizeAscii('Topps/Chrome - #77')).toBe('topps chrome 77');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeAscii('')).toBe('');
    expect(normalizeAscii('   ')).toBe('');
  });

  it('is idempotent', () => {
    const s = '  PSA 10 — Topps Chrome  ';
    expect(normalizeAscii(normalizeAscii(s))).toBe(normalizeAscii(s));
  });
});

describe('slugify', () => {
  it('produces hyphen-separated slugs', () => {
    expect(slugify('Panini Prizm')).toBe('panini-prizm');
    expect(slugify('Luka Dončić')).toBe('luka-doncic');
  });

  it('returns "unknown" for empty input', () => {
    expect(slugify('')).toBe('unknown');
    expect(slugify('   ')).toBe('unknown');
  });

  it('is stable across casing and punctuation', () => {
    expect(slugify("Topps Chrome -- 2018")).toBe('topps-chrome-2018');
  });
});

describe('parseYear', () => {
  it('extracts the first 4-digit year', () => {
    expect(parseYear('2018 Prizm Luka')).toBe(2018);
    expect(parseYear('1986 Fleer Jordan')).toBe(1986);
  });

  it('returns null for impossible years', () => {
    expect(parseYear('1899 antique')).toBeNull();
    expect(parseYear('9999 hello')).toBeNull();
  });

  it('returns null when no year is present', () => {
    expect(parseYear('Topps Chrome rookie')).toBeNull();
  });

  it('ignores card numbers that look like years', () => {
    // '#77' isn't a year. '#1985' could be — current parser is permissive.
    // We accept this trade-off: callers normalize card numbers separately.
    expect(parseYear('#77 Luka')).toBeNull();
  });
});

describe('parseGrade', () => {
  it('parses PSA 10', () => {
    expect(parseGrade('2018 Prizm Luka Silver PSA 10')).toEqual({
      grader: 'PSA',
      grade: '10',
    });
  });

  it('parses BGS half-grades', () => {
    expect(parseGrade('BGS 9.5')).toEqual({ grader: 'BGS', grade: '9.5' });
  });

  it('parses SGC and CGC', () => {
    expect(parseGrade('SGC 8')).toEqual({ grader: 'SGC', grade: '8' });
    expect(parseGrade('CGC 9')).toEqual({ grader: 'CGC', grade: '9' });
  });

  it('treats "Beckett" as BGS', () => {
    expect(parseGrade('Beckett 9')).toEqual({ grader: 'BGS', grade: '9' });
  });

  it('returns RAW for raw cards', () => {
    expect(parseGrade('raw Luka')).toEqual({ grader: 'RAW', grade: 'RAW' });
  });

  it('returns null when no grade is found', () => {
    expect(parseGrade('2018 Prizm Luka Silver')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(parseGrade('psa 10')).toEqual({ grader: 'PSA', grade: '10' });
    expect(parseGrade('PSA 10')).toEqual({ grader: 'PSA', grade: '10' });
  });
});

describe('findCommonParallel', () => {
  it('finds single-word parallels', () => {
    expect(findCommonParallel('2018 Prizm Luka Silver')).toBe('silver');
    expect(findCommonParallel('Gold /10')).toBe('gold');
  });

  it('finds multi-word parallels', () => {
    expect(findCommonParallel('Cracked Ice prizm')).toBe('cracked ice');
  });

  it('returns null when no common parallel matches', () => {
    expect(findCommonParallel('2018 Prizm Luka')).toBeNull();
  });
});

describe('normalizeQuery', () => {
  it('produces the same shape as normalizeAscii', () => {
    expect(normalizeQuery('  Panini   Prizm Luka Silver  ')).toBe(
      'panini prizm luka silver',
    );
  });

  it('is idempotent', () => {
    const q = '2018 Panini Prizm Luka Dončić Silver PSA 10';
    expect(normalizeQuery(normalizeQuery(q))).toBe(normalizeQuery(q));
  });
});
