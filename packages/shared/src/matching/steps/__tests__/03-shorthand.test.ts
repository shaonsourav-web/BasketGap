import { describe, expect, it } from 'vitest';

import { HEAD_DEFAULTS, SHORTHAND } from '../../dictionaries/shorthand.ts';
import { CANONICAL_SEED } from '../../seed/canonical-seed.ts';
import { expandShorthand, expandShorthandDetailed } from '../03-shorthand.ts';

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

// The pipeline caps the confidence band at `assumed` whenever a head default
// fired, so the flag reporting it must be exact: set for bare generic heads
// (with or without trailing size/pack tokens) and clear for every line where
// the shopper's own words picked the variant.
describe('head-default reporting', () => {
  it.each([
    ['coffee', 'coffee instant'],
    ['rice', 'long grain white rice'],
    ['milk 1 L', 'full cream milk 1 L'],
    ['potatoes 2 kg', 'potatoes washed 2 kg'],
    ['almond milk', 'almond milk unsweetened'],
    // Reached through SHORTHAND first, then the head default on the result.
    ['spuds 2 kg', 'potatoes washed 2 kg'],
    ['pb', 'peanut butter smooth'],
  ])('flags %j as a head-default resolution', (input, expanded) => {
    const out = expandShorthandDetailed(input);
    expect(out.expanded).toBe(expanded);
    expect(out.headDefaultApplied).toBe(true);
    expect(out.headDefaultNote).not.toBe('');
  });

  it.each([
    'coffee instant 200 g',
    'skim milk 1 L',
    'soy milk',
    'bega tasty 500 g',
    'english breakfast tea bags',
    'snacks',
    '',
  ])('does not flag %j', (input) => {
    const out = expandShorthandDetailed(input);
    expect(out.headDefaultApplied).toBe(false);
    expect(out.headDefaultNote).toBe('');
  });

  it('the note names the head and the default it resolved to', () => {
    expect(expandShorthandDetailed('coffee').headDefaultNote).toBe('coffee → coffee instant');
  });

  it('expandShorthand stays a plain string API', () => {
    expect(expandShorthand('coffee')).toBe('coffee instant');
  });
});

// QC 2026-09-02 F3: "detergent" → Dishwashing Liquid and "mince" → Beef Mince
// are the same kind of engine guess as a HEAD_DEFAULTS hit — one of several
// plausible products chosen on the shopper's behalf — and must be reported the
// same way so the pipeline caps them at `assumed`.
describe('ambiguous shorthand is reported as an engine assumption', () => {
  it.each([
    ['detergent', 'dishwashing liquid'],
    ['mince', 'beef mince'],
    ['mince 500 g', 'beef mince 500 g'],
    ['cooking oil', 'vegetable oil'],
  ])('flags %j', (input, expanded) => {
    const out = expandShorthandDetailed(input);
    expect(out.expanded).toBe(expanded);
    expect(out.headDefaultApplied).toBe(true);
    expect(out.headDefaultNote).toContain('→');
  });

  it.each([
    // Unambiguous expansions name exactly one product and stay unflagged.
    ['ketchup', 'tomato sauce bottle'],
    ['philly', 'cream cheese'],
    ['lean mince', 'beef mince lean'],
    ['lamb mince', 'lamb mince'],
  ])('does not flag %j', (input, expanded) => {
    const out = expandShorthandDetailed(input);
    expect(out.expanded).toBe(expanded);
    expect(out.headDefaultApplied).toBe(false);
  });
});

describe('QC 2026-09-02 expansion fixes', () => {
  // F6: `x` stopped the size-token trim, so the head default never fired.
  it.each([
    ['3 x 1 L milk', '3 x 1 L full cream milk'],
    ['2 x bread', '2 x white sandwich bread loaf'],
  ])('sees past pack multipliers: %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });

  // Two expansions meeting head to tail used to emit a word twice, which was
  // enough similarity noise to sink the line.
  it.each([
    ['brown bread wholemeal', 'wholemeal bread loaf'],
    ['wraps tortilla', 'wraps'],
    ['chippies salted', 'potato chips salted'],
    ['shortcut bacon', 'bacon rashers'],
  ])('emits no repeated token: %j → %j', (input, expected) => {
    expect(expandShorthand(input)).toBe(expected);
  });

  // F8: `button` was deleted by cleanLine, so this key could never fire.
  it('reaches the button mushrooms key', () => {
    expect(expandShorthand('button mushrooms')).toBe('mushrooms');
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
