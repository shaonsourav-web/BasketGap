import { describe, expect, it } from 'vitest';

import { spellCorrect } from '../02-spell-correct.ts';

describe('spellCorrect', () => {
  it.each([
    ['mlk', 'milk'],
    ['bred loaf', 'bread loaf'],
    ['cheees slices', 'cheese slices'],
    ['choclate biscuits', 'chocolate biscuits'],
    ['bananna', 'banana'],
    ['brocoli', 'broccoli'],
    ['carot', 'carrot'],
    ['zuchini 1 kg', 'zucchini 1 kg'],
    ['cofee jar', 'coffee jar'],
    ['margerine', 'margarine'],
    ['lasagne sheets', 'lasagna sheets'],
    ['milk', 'milk'],
    ['bread', 'bread'],
    ['', ''],
  ])('corrects %j → %j', (input, expected) => {
    expect(spellCorrect(input)).toBe(expected);
  });
});
