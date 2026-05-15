import { describe, expect, it } from 'vitest';

import { heuristicParse } from '@/lib/layer2/identity/parse';

describe('heuristicParse', () => {
  it('extracts year, grader, grade, and a common parallel', () => {
    const p = heuristicParse('2018 Prizm Luka Silver PSA 10');
    expect(p.year).toBe(2018);
    expect(p.grader).toBe('PSA');
    expect(p.grade).toBe('10');
    expect(p.parallel).toBe('silver');
  });

  it('does not invent fields it cannot see', () => {
    const p = heuristicParse('PSA 10');
    expect(p.grader).toBe('PSA');
    expect(p.grade).toBe('10');
    expect(p.year).toBeUndefined();
    expect(p.setName).toBeUndefined();
    expect(p.player).toBeUndefined();
  });

  it('recognises raw graders', () => {
    const p = heuristicParse('2018 Topps Chrome Trout raw');
    expect(p.grader).toBe('RAW');
    expect(p.grade).toBe('RAW');
  });

  it('handles BGS half-grades', () => {
    const p = heuristicParse('2018 Prizm BGS 9.5');
    expect(p.grader).toBe('BGS');
    expect(p.grade).toBe('9.5');
  });

  it('returns an empty partial for an unhelpful query', () => {
    const p = heuristicParse('shiny card');
    expect(p.year).toBeUndefined();
    expect(p.grader).toBeUndefined();
    expect(p.parallel).toBeUndefined();
  });
});
