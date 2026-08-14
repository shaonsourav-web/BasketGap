import { describe, expect, it } from 'vitest';

import { cleanLine } from '../01-clean.ts';

describe('cleanLine', () => {
  it.each([
    ['Milk 2L', 'milk 2 L'],
    ['  Bread  ', 'bread'],
    ['Eggs (free range)', 'eggs free range'],
    ['Apples — 1kg', 'apples 1 kg'],
    ['Coca-Cola 2L', 'coca-cola 2 L'],
    ['Yogurt 1KG', 'yogurt 1 kg'],
    ['Pasta 500g', 'pasta 500 g'],
    ['12 eggs', '12 eggs'],
    ['Tim Tams!!!', 'tim tams'],
    ['Tomato Sauce, 500ml', 'tomato sauce 500 ml'],
    ['Olive Oil 1 LITRE', 'olive oil 1 L'],
    ["Arnott's biscuits", "arnott's biscuits"],
    ['Cheese 250 GRAMS', 'cheese 250 g'],
    ['Milk 1.5L', 'milk 1.5 L'],
    ['rice 1 KILO', 'rice 1 kg'],
  ])('cleans %j → %j', (input, expected) => {
    expect(cleanLine(input)).toBe(expected);
  });
});
