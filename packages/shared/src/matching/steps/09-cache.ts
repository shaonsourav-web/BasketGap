import { createHash } from 'node:crypto';
import { toBaseUnit } from '../lib/units.ts';

export interface CacheKeyInput {
  cleaned: string;
  sizeValue: number | null;
  sizeUom: string | null;
  quantity: number | null;
}

/**
 * Builds the variant-complete cache key. Size and pack quantity are part of
 * the key so that "milk 1L" and "milk 3L" never collide, while sizes are
 * normalised to base units so "milk 2L" and "milk 2000ml" share one entry.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  let sizePart = '';
  if (input.sizeValue != null && input.sizeUom != null) {
    const base = toBaseUnit(input.sizeValue, input.sizeUom);
    sizePart = `${base.value}${base.uom}`;
  }
  return [input.cleaned, sizePart, input.quantity ?? ''].join('|');
}

export function hashCleanedInput(cleaned: string): string {
  return createHash('sha256').update(cleaned, 'utf8').digest('hex');
}
