import { describe, expect, it } from 'vitest';

import { extractBrand } from '../brand.ts';

const BRANDS = new Set(['bega', 'coca-cola', 'weet-bix', 'coles smart buy']);

describe('extractBrand', () => {
  it('extracts a single-token brand and removes it from the residual', () => {
    expect(extractBrand('bega tasty cheese', BRANDS)).toEqual({
      brand: 'bega',
      residual: 'tasty cheese',
    });
  });

  it('extracts a multi-token brand by longest match', () => {
    expect(extractBrand('coles smart buy bread', BRANDS)).toEqual({
      brand: 'coles smart buy',
      residual: 'bread',
    });
  });

  it('finds the brand mid-line', () => {
    expect(extractBrand('cheese bega tasty', BRANDS)).toEqual({
      brand: 'bega',
      residual: 'cheese tasty',
    });
  });

  it('returns null when no known brand appears', () => {
    expect(extractBrand('full cream milk', BRANDS)).toEqual({
      brand: null,
      residual: 'full cream milk',
    });
  });

  it('keeps an empty residual when the line is only a brand', () => {
    expect(extractBrand('bega', BRANDS)).toEqual({ brand: 'bega', residual: '' });
  });

  it('handles empty input and empty brand set', () => {
    expect(extractBrand('', BRANDS)).toEqual({ brand: null, residual: '' });
    expect(extractBrand('bega cheese', new Set<string>())).toEqual({
      brand: null,
      residual: 'bega cheese',
    });
  });
});
