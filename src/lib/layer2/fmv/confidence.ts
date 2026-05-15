/**
 * Bootstrap 95% confidence interval for the weighted mean. Methodology v1.0.0.
 *
 * Procedure (decisions D5):
 *  - 1,000 iterations
 *  - Each iteration draws `n` comps from the input uniformly with
 *    replacement (every comp has 1/n probability per slot)
 *  - Each drawn comp keeps its original weight
 *  - Iteration value = weighted mean of the resample
 *  - CI = [floor(samples.length * 0.025), floor(samples.length * 0.975)]
 *    indices of the sorted resample means (matches spec pseudocode)
 *
 * RNG is injectable for deterministic tests. Default is `Math.random`.
 */

import type { WeightedComp } from '@/lib/layer2/types';

export const DEFAULT_BOOTSTRAP_ITERATIONS = 1000;

export type BootstrapOptions = {
  iterations?: number;
  rng?: () => number; // uniform [0, 1)
};

export type BootstrapResult = {
  ciLowCents: number;
  ciHighCents: number;
  iterations: number;
};

/**
 * mulberry32 seeded RNG. Tiny, deterministic, good enough for resample
 * draws in tests. Not cryptographic. Exported for test fixtures.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function rng() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute the bootstrap CI of the weighted mean for a basket of comps.
 *
 * Assumes `weighted.length >= 1` and total weight > 0. Caller is
 * responsible for the sample-size and non-zero-weight gates upstream.
 */
export function bootstrapCi(
  weighted: readonly WeightedComp[],
  opts: BootstrapOptions = {},
): BootstrapResult {
  const iterations = opts.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const rng = opts.rng ?? Math.random;
  const n = weighted.length;
  if (n === 0) {
    throw new RangeError('bootstrapCi requires at least one comp');
  }
  if (iterations < 1) {
    throw new RangeError(`bootstrapCi iterations must be >= 1, got ${iterations}`);
  }

  const samples = new Array<number>(iterations);
  for (let i = 0; i < iterations; i++) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rng() * n);
      const drawn = weighted[idx]!;
      weightedSum += drawn.salePriceCents * drawn.weight;
      totalWeight += drawn.weight;
    }
    samples[i] = totalWeight > 0 ? weightedSum / totalWeight : 0;
  }
  samples.sort((a, b) => a - b);

  const ciLow = samples[Math.floor(samples.length * 0.025)]!;
  const ciHigh = samples[Math.floor(samples.length * 0.975)]!;

  return {
    ciLowCents: Math.round(ciLow),
    ciHighCents: Math.round(ciHigh),
    iterations,
  };
}
