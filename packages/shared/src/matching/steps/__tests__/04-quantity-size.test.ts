import { describe, expect, it } from 'vitest';

import { extractQuantitySize } from '../04-quantity-size.ts';

describe('extractQuantitySize', () => {
  it('extracts L size', () => {
    expect(extractQuantitySize('milk 2 L')).toEqual({
      residual: 'milk',
      quantity: null,
      sizeValue: 2,
      sizeUom: 'L',
    });
  });
  it('extracts kg size', () => {
    expect(extractQuantitySize('rice 1 kg')).toEqual({
      residual: 'rice',
      quantity: null,
      sizeValue: 1,
      sizeUom: 'kg',
    });
  });
  it('extracts g size', () => {
    expect(extractQuantitySize('pasta 500 g')).toEqual({
      residual: 'pasta',
      quantity: null,
      sizeValue: 500,
      sizeUom: 'g',
    });
  });
  it('extracts ml size', () => {
    expect(extractQuantitySize('sauce 500 ml')).toEqual({
      residual: 'sauce',
      quantity: null,
      sizeValue: 500,
      sizeUom: 'ml',
    });
  });
  it('extracts fractional L', () => {
    expect(extractQuantitySize('milk 1.5 L')).toEqual({
      residual: 'milk',
      quantity: null,
      sizeValue: 1.5,
      sizeUom: 'L',
    });
  });
  it('extracts pack count from "x6"', () => {
    expect(extractQuantitySize('beer x 6')).toEqual({
      residual: 'beer',
      quantity: 6,
      sizeValue: null,
      sizeUom: null,
    });
  });
  it('extracts pack count from "6 pack"', () => {
    const r = extractQuantitySize('beer 6 pack');
    expect(r.quantity).toBe(6);
    expect(r.residual).toBe('beer');
  });
  it('extracts dozen as 12', () => {
    const r = extractQuantitySize('eggs 1 dozen');
    expect(r.quantity).toBe(12);
    expect(r.residual).toBe('eggs');
  });
  it('extracts "doz" alone as 12', () => {
    const r = extractQuantitySize('eggs doz');
    expect(r.quantity).toBe(12);
    expect(r.residual).toBe('eggs');
  });
  it('returns nulls when no size or pack', () => {
    expect(extractQuantitySize('cheese')).toEqual({
      residual: 'cheese',
      quantity: null,
      sizeValue: null,
      sizeUom: null,
    });
  });
  it('captures both size and pack', () => {
    const r = extractQuantitySize('water 600 ml x 24');
    expect(r.sizeValue).toBe(600);
    expect(r.sizeUom).toBe('ml');
    expect(r.quantity).toBe(24);
    expect(r.residual).toBe('water');
  });
  it('handles empty string', () => {
    expect(extractQuantitySize('')).toEqual({
      residual: '',
      quantity: null,
      sizeValue: null,
      sizeUom: null,
    });
  });
});
