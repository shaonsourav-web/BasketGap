import { describe, expect, it } from 'vitest';

import { buildCacheKey, hashCleanedInput } from '../09-cache.ts';

describe('buildCacheKey', () => {
  it('separates differently sized variants of the same residual', () => {
    const oneLitre = buildCacheKey({ cleaned: 'milk', sizeValue: 1, sizeUom: 'L', quantity: null });
    const threeLitre = buildCacheKey({
      cleaned: 'milk',
      sizeValue: 3,
      sizeUom: 'L',
      quantity: null,
    });
    expect(oneLitre).not.toBe(threeLitre);
    expect(hashCleanedInput(oneLitre)).not.toBe(hashCleanedInput(threeLitre));
  });

  it('treats equivalent sizes in different units as the same key', () => {
    const litres = buildCacheKey({ cleaned: 'milk', sizeValue: 2, sizeUom: 'L', quantity: null });
    const mls = buildCacheKey({ cleaned: 'milk', sizeValue: 2000, sizeUom: 'ml', quantity: null });
    expect(litres).toBe(mls);
  });

  it('treats equivalent masses in g and kg as the same key', () => {
    const grams = buildCacheKey({ cleaned: 'mince', sizeValue: 500, sizeUom: 'g', quantity: null });
    const kilos = buildCacheKey({
      cleaned: 'mince',
      sizeValue: 0.5,
      sizeUom: 'kg',
      quantity: null,
    });
    expect(grams).toBe(kilos);
  });

  it('includes pack quantity in the key', () => {
    const single = buildCacheKey({ cleaned: 'eggs', sizeValue: null, sizeUom: null, quantity: 12 });
    const carton = buildCacheKey({ cleaned: 'eggs', sizeValue: null, sizeUom: null, quantity: 24 });
    expect(single).not.toBe(carton);
  });

  it('distinguishes sized from unsized queries', () => {
    const unsized = buildCacheKey({
      cleaned: 'milk',
      sizeValue: null,
      sizeUom: null,
      quantity: null,
    });
    const sized = buildCacheKey({ cleaned: 'milk', sizeValue: 2, sizeUom: 'L', quantity: null });
    expect(unsized).not.toBe(sized);
  });

  it('separates a head-default resolution from the same text typed in full', () => {
    const base = { cleaned: 'coffee instant', sizeValue: null, sizeUom: null, quantity: null };
    // The head-default line's band is capped at `assumed`, so sharing an entry
    // with the typed-in-full line would leak that cap to a confident match.
    expect(buildCacheKey({ ...base, headDefaultApplied: true })).not.toBe(buildCacheKey(base));
  });

  it('leaves keys byte-identical when no head default fired', () => {
    const base = { cleaned: 'coffee instant', sizeValue: null, sizeUom: null, quantity: null };
    expect(buildCacheKey({ ...base, headDefaultApplied: false })).toBe(buildCacheKey(base));
  });
});
