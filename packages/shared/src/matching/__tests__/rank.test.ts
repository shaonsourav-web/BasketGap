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

  // QC 2026-09-02 F4. A size the shopper stated and the candidate contradicts
  // used to score the same 0 as "no size given", so the name floor still
  // priced "coke 1.25 L" as a 2 L bottle at `matched`.
  it('holds a contradicted size below the matched band', () => {
    const ranked = rankCandidates({
      cleaned: 'coca cola',
      brand: null,
      sizeValue: 1.25,
      sizeUom: 'L',
      directCandidates: [
        row({ id: 'a', name: 'Coca Cola', unitSizeValue: 2, unitSizeUom: 'L', textSimilarity: 1 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.finalScore).toBeLessThan(BAND_THRESHOLDS.matched);
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(BAND_THRESHOLDS.assumed);
  });

  it('still rewards a genuine size hit as matched', () => {
    const ranked = rankCandidates({
      cleaned: 'coca cola',
      brand: null,
      sizeValue: 2,
      sizeUom: 'L',
      directCandidates: [
        row({ id: 'a', name: 'Coca Cola', unitSizeValue: 2, unitSizeUom: 'L', textSimilarity: 1 }),
      ],
      vectorCandidates: [],
    });
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(BAND_THRESHOLDS.matched);
  });

  // F2: the quantity was extracted and then dropped, so 12ea and 18ea tied at
  // 0.820 and the winner was whichever row the database returned first.
  it('uses a stated pack count to break an otherwise exact tie', () => {
    const input = {
      cleaned: 'free range eggs',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      quantity: 18,
      vectorCandidates: [],
    };
    const twelve = row({
      id: 'a',
      name: 'Free Range Eggs',
      unitSizeValue: 12,
      unitSizeUom: 'ea',
      textSimilarity: 1,
    });
    const eighteen = row({
      id: 'b',
      name: 'Free Range Eggs',
      unitSizeValue: 18,
      unitSizeUom: 'ea',
      textSimilarity: 1,
    });
    expect(
      rankCandidates({ ...input, directCandidates: [twelve, eighteen] })[0]!.unitSizeValue,
    ).toBe(18);
    expect(
      rankCandidates({ ...input, directCandidates: [eighteen, twelve] })[0]!.unitSizeValue,
    ).toBe(18);
  });

  it('orders equal scores deterministically by name then id', () => {
    const a = row({ id: 'zzz', name: 'Alpha Milk', textSimilarity: 1 });
    const b = row({ id: 'aaa', name: 'Beta Milk', textSimilarity: 1 });
    const input = {
      cleaned: 'milk',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      vectorCandidates: [],
    };
    const forward = rankCandidates({ ...input, directCandidates: [a, b] });
    const reversed = rankCandidates({ ...input, directCandidates: [b, a] });
    expect(forward[0]!.finalScore).toBe(forward[1]!.finalScore);
    expect(forward.map((c) => c.canonicalProductId)).toEqual(
      reversed.map((c) => c.canonicalProductId),
    );
    expect(forward[0]!.name).toBe('Alpha Milk');
  });

  // Dosage form and qualifier negation are product identity, not packaging:
  // dishwasher powder is not dishwasher tablets (stress set 2026-09-02).
  it.each([
    ['dishwasher powder', 'Dishwasher Tablets'],
    ['laundry detergent liquid', 'Laundry Detergent Powder'],
    ['sweetened almond milk', 'Almond Milk Unsweetened'],
    ['salted butter', 'Unsalted Butter'],
  ])('defers rather than selling %j as %j', (cleaned, name) => {
    const ranked = rankCandidates({
      cleaned,
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [row({ id: 'a', name, textSimilarity: 0.95 })],
      vectorCandidates: [],
    });
    expect(ranked[0]!.finalScore).toBeLessThan(BAND_THRESHOLDS.assumed);
  });

  it('does not read agreement as negation', () => {
    const ranked = rankCandidates({
      cleaned: 'unsalted butter',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [row({ id: 'a', name: 'Unsalted Butter', textSimilarity: 0.95 })],
      vectorCandidates: [],
    });
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(BAND_THRESHOLDS.matched);
  });

  // A line that already contains every word of a name must not be diluted into
  // silence by one trailing packaging or marketing noun.
  it('tolerates a packaging noun beside a complete name', () => {
    const ranked = rankCandidates({
      cleaned: 'coca cola bottle',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [row({ id: 'a', name: 'Coca Cola', textSimilarity: 0.62 })],
      vectorCandidates: [],
    });
    expect(ranked[0]!.finalScore).toBeGreaterThanOrEqual(BAND_THRESHOLDS.matched);
  });

  it('does not tolerate an extra word that carries identity', () => {
    const ranked = rankCandidates({
      cleaned: 'diet coca cola',
      brand: null,
      sizeValue: null,
      sizeUom: null,
      directCandidates: [row({ id: 'a', name: 'Coca Cola', textSimilarity: 0.62 })],
      vectorCandidates: [],
    });
    expect(ranked[0]!.finalScore).toBeLessThan(BAND_THRESHOLDS.matched);
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
