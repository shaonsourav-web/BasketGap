import { describe, expect, it } from 'vitest';

import { buildVocabulary } from '../../lib/vocabulary.ts';
import { fuzzyCorrect, spellCorrect } from '../02-spell-correct.ts';

describe('spellCorrect — exact typo table (fast path)', () => {
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

describe('spellCorrect — fuzzy fallback against the catalogue vocabulary', () => {
  it.each([
    ['chese', 'cheese'],
    ['chese slices', 'cheese slices'],
    ['tommatoes', 'tomatoes'],
    ['tinned tommatoes', 'tinned tomatoes'],
    ['red onoins', 'red onions'],
    ['cucmber', 'cucumber'],
    ['spinnach 120 g', 'spinach 120 g'],
    ['mushroms 500 g', 'mushrooms 500 g'],
    ['bluberries punnet', 'blueberries punnet'],
    ['muesly 750 g', 'muesli 750 g'],
  ])('corrects %j → %j', (input, expected) => {
    expect(spellCorrect(input)).toBe(expected);
  });

  it.each([
    // Correctly spelled catalogue words are never second-guessed.
    ['cheese', 'cheese'],
    ['bananas cavendish', 'bananas cavendish'],
    ['snags', 'snags'],
    // Category words are in the vocabulary, so "snacks" is not pulled to "snags".
    ['snacks', 'snacks'],
    // Nothing in the catalogue is within the edit budget.
    ['toothpaste', 'toothpaste'],
    ['kombucha 500 ml', 'kombucha 500 ml'],
    ['xyzzy asdf', 'xyzzy asdf'],
    // Sizes and units are not word-like and are left alone.
    ['1.25 L', '1.25 L'],
    ['12 pack', '12 pack'],
  ])('leaves %j alone', (input, expected) => {
    expect(spellCorrect(input)).toBe(expected);
  });
});

describe('fuzzyCorrect — guards', () => {
  const vocabulary = buildVocabulary(['milk', 'bake', 'cake', 'cheese', 'lentils']);

  it('never corrects tokens shorter than four characters', () => {
    expect(fuzzyCorrect('mik', vocabulary)).toBeNull();
    expect(fuzzyCorrect('mlk', vocabulary)).toBeNull();
    expect(fuzzyCorrect('ilk', vocabulary)).toBeNull();
  });

  it('never corrects a token that is already in the vocabulary', () => {
    expect(fuzzyCorrect('milk', vocabulary)).toBeNull();
    expect(fuzzyCorrect('cheese', vocabulary)).toBeNull();
  });

  it('corrects an unambiguous near-miss', () => {
    expect(fuzzyCorrect('milkk', vocabulary)).toBe('milk');
    expect(fuzzyCorrect('lentills', vocabulary)).toBe('lentils');
  });

  it('refuses to correct when two vocabulary words tie at the same distance', () => {
    // "lake" is one edit from both "bake" and "cake" — ambiguous, so untouched.
    expect(fuzzyCorrect('lake', vocabulary)).toBeNull();
  });

  it('allows two edits only from six characters up', () => {
    const vocab = buildVocabulary(['cheese', 'oats']);
    expect(fuzzyCorrect('chesse', vocab)).toBe('cheese'); // 6 chars, distance 1
    expect(fuzzyCorrect('chesee', vocab)).toBe('cheese'); // 6 chars, distance 2 allowed
    expect(fuzzyCorrect('oaks', vocab)).toBe('oats'); // 4 chars, distance 1 allowed
    expect(fuzzyCorrect('okks', vocab)).toBeNull(); // 4 chars, distance 2 refused
  });

  it('leaves non-word tokens alone', () => {
    expect(fuzzyCorrect('1.25', vocabulary)).toBeNull();
    expect(fuzzyCorrect('500g', vocabulary)).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const first = spellCorrect('tommatoes and chese');
    expect(spellCorrect('tommatoes and chese')).toBe(first);
    expect(first).toBe('tomatoes and cheese');
  });
});
