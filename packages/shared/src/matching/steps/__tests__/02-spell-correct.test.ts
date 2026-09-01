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

// QC 2026-09-02 F1/F7: the corrector used to be allowed to rewrite a token
// into ANY vocabulary word, including shorthand slang keys, so "straws" became
// "strawbs" → Strawberries Punnet at `matched`. Correction targets are now
// canonical names, brands and typo-table values only.
describe('spellCorrect — never invents a product from a real English word', () => {
  it.each([
    ['straws', 'straws'],
    ['plastic straws', 'plastic straws'],
    ['pepper', 'pepper'],
    ['beer', 'beer'],
    ['spices', 'spices'],
    ['bleach', 'bleach'],
    ['cold', 'cold'],
    ['cats', 'cats'],
    ['babies', 'babies'],
    ['pastry', 'pastry'],
    ['cups', 'cups'],
    ['muesli bars', 'muesli bars'],
    // F5: the singular half of a protected plural was missing, so "pear"
    // became "peas" → Frozen Peas.
    ['pear', 'pear'],
  ])('leaves %j alone', (input, expected) => {
    expect(spellCorrect(input)).toBe(expected);
  });
});

describe('spellCorrect — missing-space compounds', () => {
  it.each([
    ['oatmilk', 'oat milk'],
    ['soymilk', 'soy milk'],
    ['bakedbeans', 'baked beans'],
    // Only an unambiguous single split of two KNOWN words is taken.
    ['xyzzyfoo', 'xyzzyfoo'],
    ['milk', 'milk'],
  ])('splits %j → %j', (input, expected) => {
    expect(spellCorrect(input)).toBe(expected);
  });
});

describe('spellCorrect — two-edit corrections stay typo-shaped', () => {
  it.each([
    // Adjacent transpositions are the classic fat-finger typo and survive.
    ['mlik', 'milk'],
    ['otas', 'oats'],
  ])('corrects %j → %j', (input, expected) => {
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
