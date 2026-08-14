import { describe, expect, it } from 'vitest';

import { HEAD_DEFAULTS, SHORTHAND } from '../../dictionaries/shorthand.ts';
import { CANONICAL_SEED } from '../../seed/canonical-seed.ts';
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
    ['long life milk', 'uht long life milk'],
    ['full cream 2 L', 'full cream milk 2 L'],
    ['weetbix', 'weet-bix cereal'],
    ['avo', 'avocado'],
    ['scotch fingers', 'scotch finger biscuits'],
    ['plain milk', 'plain milk'],
    ['', ''],
    ['veggies and chook', 'vegetables and chicken'],
  ])('expands %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });

  it.each([
    ['full cream milk', 'full cream milk'],
    ['skim milk', 'skim milk'],
    ['lite milk', 'light milk'],
    ['full cream milk 2 L', 'full cream milk 2 L'],
    ['skim milk 1 L', 'skim milk 1 L'],
  ])('does not duplicate expansion tails: %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });

  // Round 8.5 — grown dictionary. Every expansion below must land on a phrasing
  // the seed catalogue actually carries.
  it.each([
    ['fc milk', 'full cream milk'],
    ['evoo', 'olive oil extra virgin'],
    ['marg 500 g', 'margarine spread 500 g'],
    ['spag 500 g', 'spaghetti pasta 500 g'],
    ['chook breast', 'chicken breast fillets'],
    ['rashers 250 g', 'bacon rashers 250 g'],
    ['rump', 'beef steak rump'],
    ['tim tams', 'tim tams chocolate biscuits'],
    ['coke 2 L', 'coca cola 2 L'],
    ['tinned tomatoes', 'diced tomatoes can'],
    ['greek yogurt', 'greek style yogurt'],
    ['dozen eggs', 'free range eggs dozen'],
    ['washing powder 2 kg', 'laundry detergent powder 2 kg'],
    ['laundry detergent liquid 2 L', 'laundry detergent liquid 2 L'],
    ['dunny roll 12 pack', 'toilet paper 12 pack'],
    ['bega tasty 500 g', 'bega tasty cheese block 500 g'],
    ['oj 2 L', 'orange juice 2 L'],
    ['mushies 500 g', 'mushrooms 500 g'],
    ['strawbs', 'strawberries punnet'],
    ['caps', 'capsicum red'],
  ])('expands new shorthand %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });
});

describe('head defaults', () => {
  it.each([
    ['milk', 'full cream milk'],
    ['milk 1 L', 'full cream milk 1 L'],
    ['bread', 'white sandwich bread loaf'],
    ['eggs dozen', 'free range eggs dozen'],
    ['macaroni', 'macaroni pasta'],
    ['lentils', 'lentils can'],
    ['bananas', 'bananas cavendish'],
    ['potatoes 2 kg', 'potatoes washed 2 kg'],
    ['cheese slices', 'tasty cheese slices'],
    ['tea bags', 'english breakfast tea bags'],
    ['almond milk', 'almond milk unsweetened'],
  ])('resolves the bare head %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });

  it.each([
    // A default only fires when the head is the *whole* line, so qualified
    // variants and lines the catalogue cannot serve are never rewritten.
    ['soy milk', 'soy milk'],
    ['oat milk 1 L', 'oat milk 1 L'],
    ['lactose free milk', 'lactose free milk'],
    ['mozzarella cheese', 'mozzarella cheese'],
    ['sweet potato 1 kg', 'sweet potato 1 kg'],
    ['red onions', 'red onions'],
    ['cherry tomatoes 250 g', 'cherry tomatoes 250 g'],
    ['multigrain bread loaf', 'multigrain bread loaf'],
    ['english breakfast tea bags', 'english breakfast tea bags'],
    ['snacks', 'snacks'],
    ['stuff for dinner', 'stuff for dinner'],
  ])('leaves %j alone', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });
});

describe('dictionary grounding', () => {
  const catalogueText = CANONICAL_SEED.map((e) => e.name.toLowerCase());

  it('every head default expands to an exact canonical product name', () => {
    const ungrounded = Object.entries(HEAD_DEFAULTS)
      .filter(([, expansion]) => !catalogueText.includes(expansion))
      .map(([key, expansion]) => `${key} → ${expansion}`);
    expect(ungrounded).toEqual([]);
  });

  it('no head-default key is also a shorthand key that would shadow it', () => {
    const shadowed = Object.keys(HEAD_DEFAULTS).filter(
      (key) => SHORTHAND[key] != null && SHORTHAND[key] !== HEAD_DEFAULTS[key],
    );
    // `macaroni` is intentionally in both and resolves identically either way.
    expect(shadowed.filter((k) => expandShorthand(k) !== HEAD_DEFAULTS[k])).toEqual([]);
  });
});
