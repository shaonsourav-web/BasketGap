import { createHash } from 'node:crypto';
import { toBaseUnit } from '../lib/units.ts';

export interface CacheKeyInput {
  cleaned: string;
  sizeValue: number | null;
  sizeUom: string | null;
  quantity: number | null;
  /**
   * Whether a HEAD_DEFAULTS expansion produced `cleaned`. Such a line carries a
   * capped confidence band, so it must not share a cache entry with a shopper
   * who typed the expansion in full ("milk" vs "full cream milk").
   */
  headDefaultApplied?: boolean;
}

/**
 * Builds the variant-complete cache key. Size and pack quantity are part of
 * the key so that "milk 1L" and "milk 3L" never collide, while sizes are
 * normalised to base units so "milk 2L" and "milk 2000ml" share one entry.
 * The head-default marker is appended only when it fired, so keys for every
 * other line are byte-identical to the ones already in match_cache.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  let sizePart = '';
  if (input.sizeValue != null && input.sizeUom != null) {
    const base = toBaseUnit(input.sizeValue, input.sizeUom);
    sizePart = `${base.value}${base.uom}`;
  }
  const key = [input.cleaned, sizePart, input.quantity ?? ''].join('|');
  return input.headDefaultApplied ? `${key}|head-default` : key;
}

export function hashCleanedInput(cleaned: string): string {
  return createHash('sha256').update(cleaned, 'utf8').digest('hex');
}
