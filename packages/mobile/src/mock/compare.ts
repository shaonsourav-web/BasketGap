import type { ConfidenceBand } from '@basketgap/shared/matching/types';
import type { Retailer } from '@basketgap/shared/pricing/types';

import { CATALOGUE, CATALOGUE_COVERAGE, type CatalogueEntry } from './catalogue';

export interface ComparedLine {
  id: string;
  /** Exactly what the shopper typed, kept so we can show it back to them. */
  raw: string;
  quantity: number;
  band: ConfidenceBand;
  productName: string | null;
  sizeText: string | null;
  assumption: string | null;
  /** Line totals in dollars (unit price × quantity). Null means no special listed at that retailer — never zero. */
  coles: number | null;
  woolworths: number | null;
  colesUnit: number | null;
  woolworthsUnit: number | null;
  /** Null when the line is unpriced or the two retailers are level. */
  cheaper: Retailer | null;
  /** Absolute dollar gap on this line; 0 when unpriced or level. */
  delta: number;
}

export interface SplitBasket {
  total: number;
  savingVsBestSingle: number;
  colesLineCount: number;
  woolworthsLineCount: number;
}

export interface CompareResult {
  postcode: string;
  /** When the prices behind this result were last refreshed. */
  pricedAt: Date;
  lines: ComparedLine[];
  pricedLines: ComparedLine[];
  /**
   * Lines with no promotion price at either retailer. Not matching failures —
   * they may simply not be on special. Left out of both totals.
   */
  notOnSpecialLines: ComparedLine[];
  /**
   * Lines with a listed price at exactly one retailer. Shown with "no special
   * listed" for the other store and left out of both totals, because a total
   * only compares items priced at both.
   */
  singlePriceLines: ComparedLine[];
  /** @deprecated Use notOnSpecialLines — kept for any leftover call sites. */
  unmatchedLines: ComparedLine[];
  colesTotal: number;
  woolworthsTotal: number;
  /** Which retailer came out lower. Null when the two totals are level. */
  lower: Retailer | null;
  difference: number;
  /** Saving vs shopping the dearer store for the same priced lines. */
  savingVsDearer: number;
  /** The five lines pushing the totals apart the hardest, biggest gap first. */
  drivers: ComparedLine[];
  split: SplitBasket;
  productsScanned: number;
  cataloguesChecked: number;
}

const UNIT_WORDS = new Set([
  'kg',
  'kgs',
  'kilo',
  'kilos',
  'g',
  'gram',
  'grams',
  'l',
  'lt',
  'litre',
  'litres',
  'liter',
  'liters',
  'ml',
  'pk',
  'pack',
  'packs',
  'pkt',
  'doz',
  'dozen',
]);

const EXPLICIT_SIZE = /\d+\s*(kg|g|ml|l|lt|litres?|pk|pack|doz|dozen)\b/i;

const cents = (dollars: number): number => Math.round(dollars * 100);
const dollars = (value: number): number => value / 100;

function extractQuantity(text: string): { quantity: number; rest: string } {
  const multiplied = text.match(/^(\d+)\s*[x×]\s*/i);
  if (multiplied?.[1]) {
    return { quantity: Number(multiplied[1]), rest: text.slice(multiplied[0].length) };
  }

  const leading = text.match(/^(\d+)\s+([a-z]+)/i);
  if (leading?.[1] && leading[2] && !UNIT_WORDS.has(leading[2].toLowerCase())) {
    return { quantity: Number(leading[1]), rest: text.slice(leading[1].length).trimStart() };
  }

  return { quantity: 1, rest: text };
}

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longest key wins, so "oat milk" never resolves to plain "milk". */
function lookup(cleaned: string): CatalogueEntry | null {
  let best: CatalogueEntry | null = null;
  let bestLength = 0;

  for (const entry of CATALOGUE) {
    for (const key of entry.keys) {
      if (key.length > bestLength && cleaned.includes(key)) {
        best = entry;
        bestLength = key.length;
      }
    }
  }

  return best;
}

function compareLine(raw: string, index: number): ComparedLine {
  const trimmed = raw.replace(/^\s*[-*•]\s*/, '').trim();
  const { quantity, rest } = extractQuantity(trimmed);
  const entry = lookup(clean(rest));
  const id = `line-${index}`;

  if (!entry) {
    return {
      id,
      raw: trimmed,
      quantity,
      band: 'needs_attention',
      productName: null,
      sizeText: null,
      assumption: null,
      coles: null,
      woolworths: null,
      colesUnit: null,
      woolworthsUnit: null,
      cheaper: null,
      delta: 0,
    };
  }

  // A null price means "no special listed" at that retailer. It is carried
  // through as null and never coerced to zero.
  if (entry.coles === null && entry.woolworths === null) {
    return {
      id,
      raw: trimmed,
      quantity,
      band: 'needs_attention',
      productName: entry.name,
      sizeText: entry.sizeText,
      assumption: null,
      coles: null,
      woolworths: null,
      colesUnit: null,
      woolworthsUnit: null,
      cheaper: null,
      delta: 0,
    };
  }

  const sizeGiven = EXPLICIT_SIZE.test(trimmed);
  const band: ConfidenceBand = entry.band === 'assumed' && sizeGiven ? 'matched' : entry.band;

  const colesCents = entry.coles === null ? null : cents(entry.coles) * quantity;
  const wooliesCents = entry.woolworths === null ? null : cents(entry.woolworths) * quantity;
  // Only a line priced at both retailers has a meaningful gap or a cheaper side.
  const gap =
    colesCents !== null && wooliesCents !== null ? Math.abs(colesCents - wooliesCents) : 0;
  const cheaper: Retailer | null =
    colesCents === null || wooliesCents === null || gap === 0
      ? null
      : colesCents < wooliesCents
        ? 'coles'
        : 'woolworths';

  return {
    id,
    raw: trimmed,
    quantity,
    band,
    productName: entry.name,
    sizeText: entry.sizeText,
    assumption: band === 'assumed' ? (entry.assumption ?? null) : null,
    coles: colesCents === null ? null : dollars(colesCents),
    woolworths: wooliesCents === null ? null : dollars(wooliesCents),
    colesUnit: entry.coles,
    woolworthsUnit: entry.woolworths,
    cheaper,
    delta: dollars(gap),
  };
}

export function lastRefreshedAt(now: Date = new Date()): Date {
  const refreshed = new Date(now);
  refreshed.setHours(6, 15, 0, 0);
  if (refreshed.getTime() > now.getTime()) {
    refreshed.setDate(refreshed.getDate() - 1);
  }
  return refreshed;
}

/**
 * Mock stand-in for POST /api/match plus the compare engine. Deterministic and
 * offline — swapping it for the real endpoint should not change any screen.
 */
export function compareBasket(listText: string, postcode: string, now?: Date): CompareResult {
  const lines = listText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(compareLine);

  const pricedLines = lines.filter(
    (line): line is ComparedLine & { coles: number; woolworths: number } =>
      line.coles !== null && line.woolworths !== null,
  );
  const notOnSpecialLines = lines.filter((line) => line.band === 'needs_attention');
  const singlePriceLines = lines.filter(
    (line) =>
      line.band !== 'needs_attention' && (line.coles === null) !== (line.woolworths === null),
  );

  const colesCents = pricedLines.reduce((sum, line) => sum + cents(line.coles), 0);
  const wooliesCents = pricedLines.reduce((sum, line) => sum + cents(line.woolworths), 0);

  const lower: Retailer | null =
    colesCents === wooliesCents ? null : colesCents < wooliesCents ? 'coles' : 'woolworths';

  const drivers = pricedLines
    .filter((line) => line.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  const tieGoesTo: Retailer = lower ?? 'coles';
  const splitCents = pricedLines.reduce(
    (sum, line) => sum + Math.min(cents(line.coles), cents(line.woolworths)),
    0,
  );
  const colesLineCount = pricedLines.filter(
    (line) => (line.cheaper ?? tieGoesTo) === 'coles',
  ).length;

  return {
    postcode,
    pricedAt: lastRefreshedAt(now),
    lines,
    pricedLines,
    notOnSpecialLines,
    singlePriceLines,
    unmatchedLines: notOnSpecialLines,
    colesTotal: dollars(colesCents),
    woolworthsTotal: dollars(wooliesCents),
    lower,
    difference: dollars(Math.abs(colesCents - wooliesCents)),
    savingVsDearer: dollars(Math.abs(colesCents - wooliesCents)),
    drivers,
    split: {
      total: dollars(splitCents),
      savingVsBestSingle: dollars(Math.min(colesCents, wooliesCents) - splitCents),
      colesLineCount,
      woolworthsLineCount: pricedLines.length - colesLineCount,
    },
    productsScanned: CATALOGUE_COVERAGE.productsScanned,
    cataloguesChecked: CATALOGUE_COVERAGE.cataloguesChecked,
  };
}
