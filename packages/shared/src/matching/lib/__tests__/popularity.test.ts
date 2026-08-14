import { describe, expect, it } from 'vitest';

import { hitsToPrior } from '../popularity.ts';

describe('hitsToPrior', () => {
  it('is zero for zero, negative, or invalid hits', () => {
    expect(hitsToPrior(0)).toBe(0);
    expect(hitsToPrior(-5)).toBe(0);
    expect(hitsToPrior(Number.NaN)).toBe(0);
  });

  it('is strictly monotonic in hits', () => {
    const priors = [1, 5, 20, 100, 1000].map(hitsToPrior);
    for (let i = 1; i < priors.length; i++) {
      expect(priors[i]!).toBeGreaterThan(priors[i - 1]!);
    }
  });

  it('saturates below 1', () => {
    expect(hitsToPrior(1_000_000)).toBeLessThan(1);
    expect(hitsToPrior(20)).toBe(0.5);
  });
});
