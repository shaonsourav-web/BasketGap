import { describe, it, expect } from 'vitest';
import {
  canonicalProducts,
  catalogues,
  priceObservations,
  retailerSkus,
  specials,
  zones,
} from '../db/schema.ts';

describe('schema', () => {
  it('exports all six tables from the Round 1 migration', () => {
    const tables = [
      canonicalProducts,
      catalogues,
      priceObservations,
      retailerSkus,
      specials,
      zones,
    ];
    expect(tables).toHaveLength(6);
    for (const t of tables) {
      expect(t).toBeDefined();
    }
  });
});
