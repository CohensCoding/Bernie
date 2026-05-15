import { describe, expect, it } from 'vitest';

import { slugifyIdentity } from '@/lib/layer2/identity/canonicalize';
import type { CardIdentity } from '@/lib/layer2/types';

function id(partial: Partial<CardIdentity>): CardIdentity {
  return {
    player: 'Luka Dončić',
    year: 2018,
    setName: 'Panini Prizm',
    cardNumber: '280',
    parallel: 'Silver',
    grader: 'PSA',
    grade: '10',
    ...partial,
  };
}

describe('slugifyIdentity', () => {
  it('produces the expected slug for a fully-specified card', () => {
    expect(slugifyIdentity(id({}))).toBe('panini-prizm-2018-280-luka-doncic-silver');
  });

  it('uses "base" when parallel is missing', () => {
    expect(slugifyIdentity(id({ parallel: undefined }))).toBe(
      'panini-prizm-2018-280-luka-doncic-base',
    );
  });

  it('omits the card number segment cleanly when missing', () => {
    expect(slugifyIdentity(id({ cardNumber: undefined }))).toBe(
      'panini-prizm-2018-luka-doncic-silver',
    );
  });

  it('strips diacritics from the player name', () => {
    expect(slugifyIdentity(id({ player: 'Luka Dončić' }))).toContain('luka-doncic');
  });

  it('lowercases and slug-normalizes the set name', () => {
    expect(slugifyIdentity(id({ setName: 'PANINI Prizm' }))).toContain('panini-prizm');
  });

  it('is deterministic given the same identity', () => {
    expect(slugifyIdentity(id({}))).toBe(slugifyIdentity(id({})));
  });

  it('produces different slugs for different parallels', () => {
    expect(slugifyIdentity(id({ parallel: 'Silver' }))).not.toBe(
      slugifyIdentity(id({ parallel: 'Gold' })),
    );
  });

  it('treats whitespace-only card number as absent', () => {
    expect(slugifyIdentity(id({ cardNumber: '   ' }))).toBe(
      'panini-prizm-2018-luka-doncic-silver',
    );
  });

  it('handles a set with punctuation', () => {
    expect(slugifyIdentity(id({ setName: 'Topps Chrome / Refractor' }))).toBe(
      'topps-chrome-refractor-2018-280-luka-doncic-silver',
    );
  });
});
