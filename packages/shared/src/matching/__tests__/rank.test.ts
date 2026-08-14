import { describe, expect, it } from 'vitest';

import { rankCandidates } from '../steps/07-rank.ts';
import { BAND_THRESHOLDS, type RawCandidateRow } from '../types.ts';

function row(over: Partial<RawCandidateRow> & { id: string; name: string }): RawCandidateRow {
  return {
    brand: null,
    category: null,
    unitSizeValue: null,
    unitSizeUom: null,
    ...over,
  };
}

describe('rankCandidates', () => {
  it('prefers high text similarity', () => {
    const ranked = rankCandidates({
      cleaned: 'milk 2 L',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [
        row({ id: 'a', name: 'Full Cream Milk', textSimilarity: 0.9 }),
        row({ id: 'b', name: 'Soy Milk', textSimilarity: 0.4 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]?.canonicalProductId).toBe('a');
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it('blends direct + vector signals by id', () => {
    const ranked = rankCandidates({
      cleaned: 'long life milk',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [row({ id: 'a', name: 'UHT Milk', textSimilarity: 0.4 })],
      vectorCandidates: [row({ id: 'a', name: 'UHT Milk', vectorSimilarity: 0.9 })],
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.textSimilarity).toBe(0.4);
    expect(ranked[0]!.vectorSimilarity).toBe(0.9);
  });

  it('reconciles g and kg as an exact size match', () => {
    const ranked = rankCandidates({
      cleaned: 'beef mince',
      brand: null,
      sizeValue: 500,
      sizeUom: 'g',
      directCandidates: [
        row({
          id: 'a',
          name: 'Beef Mince',
          unitSizeValue: 0.5,
          unitSizeUom: 'kg',
          textSimilarity: 0.6,
        }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.sizeMatch).toBe(1);
  });

  it('reconciles ml and L as an exact size match', () => {
    const ranked = rankCandidates({
      cleaned: 'milk',
      brand: null,
      sizeValue: 2000,
      sizeUom: 'ml',
      directCandidates: [
        row({ id: 'a', name: 'Milk', unitSizeValue: 2, unitSizeUom: 'L', textSimilarity: 0.6 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.sizeMatch).toBe(1);
  });

  it('keeps mass and volume incomparable', () => {
    const ranked = rankCandidates({
      cleaned: 'milk',
      brand: null,
      sizeValue: 2,
      sizeUom: 'L',
      directCandidates: [
        row({ id: 'a', name: 'Milk', unitSizeValue: 2000, unitSizeUom: 'g', textSimilarity: 0.6 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.sizeMatch).toBe(0);
  });

  it('rewards exact size match', () => {
    const ranked = rankCandidates({
      cleaned: 'milk',
      brand: null,
      sizeValue: 2,
      sizeUom: 'L',
      directCandidates: [
        row({ id: 'a', name: 'Milk', unitSizeValue: 2, unitSizeUom: 'L', textSimilarity: 0.6 }),
        row({ id: 'b', name: 'Milk', unitSizeValue: 1, unitSizeUom: 'L', textSimilarity: 0.6 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.canonicalProductId).toBe('a');
  });

  it('rewards exact brand match', () => {
    const ranked = rankCandidates({
      cleaned: 'tim tams',
      brand: 'Arnotts',
      sizeValue: null,
      sizeUom: null,
      directCandidates: [
        row({ id: 'a', name: 'Tim Tams', brand: 'Arnotts', textSimilarity: 0.7 }),
        row({ id: 'b', name: 'Tim Tams', brand: 'Generic', textSimilarity: 0.7 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.canonicalProductId).toBe('a');
  });

  it('clamps individual signals to [0,1]', () => {
    const ranked = rankCandidates({
      cleaned: 'milk',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [row({ id: 'a', name: 'Milk', textSimilarity: 1.5 })],
      vectorCandidates: [row({ id: 'a', name: 'Milk', vectorSimilarity: -0.2 })],
    });
    expect(ranked[0]!.textSimilarity).toBe(1);
    expect(ranked[0]!.vectorSimilarity).toBe(0);
    expect(ranked[0]!.finalScore).toBeLessThanOrEqual(1);
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('emits matched band threshold consistent with constants', () => {
    expect(BAND_THRESHOLDS.matched).toBeGreaterThan(BAND_THRESHOLDS.assumed);
  });

  it('returns empty when no candidates', () => {
    const ranked = rankCandidates({
      cleaned: 'unknown thing',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [],
      vectorCandidates: [],
    });
    expect(ranked).toEqual([]);
  });
});
