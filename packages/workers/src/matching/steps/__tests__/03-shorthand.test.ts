import { describe, expect, it } from 'vitest';

import { expandShorthand } from '../03-shorthand.ts';

describe('expandShorthand', () => {
  it.each([
    ['snags', 'sausages'],
    ['bickies', 'biscuits'],
    ['chook', 'chicken'],
    ['spag bol', 'spaghetti bolognese'],
    ['mi goreng', 'mi goreng noodles'],
    ['loo paper', 'toilet paper'],
    ['glad wrap', 'cling wrap'],
    ['long life milk', 'uht milk'],
    ['full cream 2 L', 'full cream milk 2 L'],
    ['weetbix', 'weet bix'],
    ['avo', 'avocado'],
    ['scotch fingers', 'scotch finger biscuits'],
    ['plain milk', 'plain milk'],
    ['', ''],
    ['veggies and chook', 'vegetables and chicken'],
  ])('expands %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });
});
