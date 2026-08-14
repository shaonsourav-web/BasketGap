import { describe, expect, it } from 'vitest';

import { editDistance } from '../edit-distance.ts';

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['milk', '', 4],
    ['', 'milk', 4],
    ['milk', 'milk', 0],
    ['chese', 'cheese', 1], // insertion
    ['cheesee', 'cheese', 1], // deletion
    ['chesse', 'cheese', 1], // adjacent transposition
    ['onoins', 'onions', 1], // adjacent transposition
    ['bannanas', 'bananas', 1],
    ['tommatoes', 'tomatoes', 1],
    ['bred', 'bread', 1],
    ['cucmber', 'cucumber', 1],
    ['spinnach', 'spinach', 1],
    ['milk', 'silk', 1], // substitution
    ['abc', 'cba', 2], // non-adjacent swap costs two, not one
    ['kitten', 'sitting', 3],
  ])('distance(%j, %j) = %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
  });

  it('is symmetric', () => {
    expect(editDistance('bannanas', 'bananas')).toBe(editDistance('bananas', 'bannanas'));
    expect(editDistance('kitten', 'sitting')).toBe(editDistance('sitting', 'kitten'));
  });

  it('returns max + 1 once the bound is exceeded, without computing the true distance', () => {
    expect(editDistance('kitten', 'sitting', 1)).toBe(2);
    expect(editDistance('kitten', 'sitting', 2)).toBe(3);
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
  });

  it('short-circuits on length difference alone', () => {
    expect(editDistance('milk', 'chocolate', 2)).toBe(3);
  });

  it('still reports exact distances at or under the bound', () => {
    expect(editDistance('chese', 'cheese', 1)).toBe(1);
    expect(editDistance('cheese', 'cheese', 0)).toBe(0);
  });
});
