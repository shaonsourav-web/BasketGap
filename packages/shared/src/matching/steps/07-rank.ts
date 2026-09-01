import {
  BAND_THRESHOLDS,
  type MatchCandidate,
  RANK_WEIGHTS,
  type RawCandidateRow,
} from '../types.ts';
import { toBaseUnit } from '../lib/units.ts';

export interface RankInput {
  cleaned: string;
  brand: string | null;
  sizeValue: number | null;
  sizeUom: string | null;
  /**
   * Pack count the shopper stated ("18 eggs", "12 pack"). Used as a pack-size
   * signal against `ea`/`pack` rows — QC 2026-09-02 F2 found it was extracted
   * and then thrown away, so "18 eggs" tied 12ea against 18ea and the winner
   * was whichever row the database happened to return first.
   */
  quantity?: number | null;
  directCandidates: RawCandidateRow[];
  vectorCandidates: RawCandidateRow[];
}

/** Ceiling for a candidate the shopper's own words contradict on size. */
const CONTRADICTED_SIZE_CEILING = 0.79;
/** Ceiling for a candidate whose dosage form or qualifier the line negates. */
const IDENTITY_CONFLICT_CEILING = BAND_THRESHOLDS.assumed - 0.01;

/**
 * Dosage / preparation form is product identity, not packaging: dishwasher
 * powder is not dishwasher tablets, and laundry liquid is not laundry powder.
 * A line that states one form may never be sold a candidate carrying another.
 */
const FORM_WORDS = new Set([
  'powder',
  'tablet',
  'tablets',
  'tabs',
  'liquid',
  'spray',
  'capsules',
  'granules',
  'concentrate',
]);

/**
 * Container words a canonical name may carry that a shopper routinely omits
 * ("wholemeal bread" for Wholemeal Bread Loaf). Ignored when testing whether a
 * line already names a candidate in full.
 */
const CONTAINER_WORDS = new Set(['loaf', 'can', 'punnet', 'bottle']);

/**
 * Packaging and marketing nouns a shopper appends that carry no product
 * identity ("coca cola 2 litre **bottle**", "shapes bbq **flavour**"). Only
 * these may sit beside an otherwise complete name — a count-based tolerance was
 * tried first and let "diet coke" through as Coca Cola and "lean beef mince"
 * through as plain Beef Mince, because the extra word WAS the identity.
 */
const IGNORABLE_EXTRAS = new Set([
  'bottle',
  'bottles',
  'flavour',
  'flavor',
  'flavoured',
  'flavored',
  'punnet',
  'head',
  'carton',
  'box',
  'sachet',
  'variety',
  // A variety word the catalogue does not distinguish: it carries one
  // Mushrooms row, so "button mushies" is Mushrooms, not silence.
  'button',
]);

const MIN_NAME_TOKEN = 3;

export function rankCandidates(input: RankInput): MatchCandidate[] {
  const merged = new Map<string, RawCandidateRow>();
  for (const row of input.directCandidates) {
    merged.set(row.id, { ...row });
  }
  for (const row of input.vectorCandidates) {
    const existing = merged.get(row.id);
    merged.set(row.id, existing ? { ...existing, ...row } : { ...row });
  }

  const inputTokens = tokenSet(input.cleaned);

  const candidates: MatchCandidate[] = [];
  for (const row of merged.values()) {
    const textSimilarity = clamp01(row.textSimilarity ?? 0);
    const vectorSimilarity = clamp01(row.vectorSimilarity ?? 0);
    const popularityPrior = clamp01(row.popularityPrior ?? 0);
    // `null` means "no comparable size was stated" — distinct from a stated
    // size the candidate contradicts, which used to score the same 0 and so
    // priced "coke 1.25 L" as a 2 L bottle at `matched` (QC 2026-09-02 F4).
    const sizeAssessment = computeSizeMatch(input, row);
    const sizeMatch = sizeAssessment ?? 0;
    const sizeContradicted = sizeAssessment != null && sizeAssessment < 0.9;
    const brandMatch = computeBrandMatch(input.brand, row.brand, row.brandSimilarity);
    const identityConflict = hasIdentityConflict(inputTokens, row.name);
    const namesCandidate = lineNamesCandidate(inputTokens, row.name);

    const weightedSum = clamp01(
      RANK_WEIGHTS.text * textSimilarity +
        RANK_WEIGHTS.vector * vectorSimilarity +
        RANK_WEIGHTS.size * sizeMatch +
        RANK_WEIGHTS.brand * brandMatch +
        RANK_WEIGHTS.popularity * popularityPrior,
    );
    let finalScore = weightedSum;
    // Floors fire on NAME similarity only. Brand agreement can assist a decent
    // name match but must never carry a bad one into the matched band — the
    // engine once scored "arnotts shapes crackers" as Tim Tams on brand alone.
    if (textSimilarity >= 0.95 || namesCandidate) {
      // `namesCandidate`: the line already contains every word of the
      // candidate's name, so one stray packaging or marketing noun ("coca cola
      // 2 litre bottle", "shapes bbq flavour") must not dilute an exact hit
      // into silence (QC 2026-09-02 stress set).
      finalScore = Math.max(finalScore, sizeMatch >= 1 ? 0.9 : 0.82);
    } else if (textSimilarity >= 0.7 && sizeMatch >= 1) {
      finalScore = Math.max(finalScore, 0.7);
    } else if (textSimilarity >= 0.7) {
      finalScore = Math.max(finalScore, 0.6);
    } else if (textSimilarity >= 0.65) {
      // Near-miss on name alone ("grated parmesan cheese" vs "Parmesan
      // Cheese" scores 0.696) — accept as assumed, never as matched. 0.65,
      // not 0.6: at 0.6 trigram noise sneaks junk in ("lollies party" scored
      // 0.6+ against Parmesan Cheese).
      finalScore = Math.max(finalScore, 0.55);
    } else if (brandMatch >= 0.9 && textSimilarity >= 0.45) {
      // Brand-first phrasing ("vegemite", "cadbury block 180g"): right brand
      // with moderate name overlap — accept as assumed, never as matched.
      finalScore = Math.max(
        finalScore,
        sizeMatch >= 0.9 ? Math.min(weightedSum + 0.25, 0.79) : 0.6,
      );
    }

    // Caps last: a floor describes how well the line matches, a cap describes
    // what the line rules out, and what the shopper ruled out always wins.
    if (sizeContradicted) finalScore = Math.min(finalScore, CONTRADICTED_SIZE_CEILING);
    if (identityConflict) finalScore = Math.min(finalScore, IDENTITY_CONFLICT_CEILING);

    candidates.push({
      canonicalProductId: row.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      unitSizeValue: row.unitSizeValue,
      unitSizeUom: row.unitSizeUom,
      textSimilarity,
      vectorSimilarity,
      sizeMatch,
      brandMatch,
      popularityPrior,
      finalScore,
    });
  }

  // Name then id break every tie, so two rows that score identically can never
  // swap places between runs — the live query orders only by score, so without
  // this the winner of a tie was whatever Postgres returned first (F2).
  candidates.sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      a.name.localeCompare(b.name) ||
      a.canonicalProductId.localeCompare(b.canonicalProductId),
  );
  return candidates.slice(0, 10);
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/**
 * True when the line states a dosage form, or the negation of a qualifier,
 * that the candidate's name contradicts — "dishwasher powder" against
 * Dishwasher Tablets, "sweetened almond milk" against Almond Milk Unsweetened.
 * Such a candidate is not a weaker match, it is the wrong product.
 */
function hasIdentityConflict(inputTokens: Set<string>, name: string): boolean {
  const nameTokens = tokenSet(name);

  let inputForm: string | null = null;
  for (const token of inputTokens) {
    if (FORM_WORDS.has(token)) inputForm = token;
  }
  if (inputForm) {
    for (const token of nameTokens) {
      if (FORM_WORDS.has(token) && !sameForm(token, inputForm)) return true;
    }
  }

  // Qualifier negation, both directions: "salted" vs "unsalted", "sweetened"
  // vs "unsweetened". Token-level, so "unsalted butter" against Unsalted
  // Butter agrees rather than conflicts.
  for (const token of inputTokens) {
    if (token.length < 4) continue;
    if (nameTokens.has(`un${token}`)) return true;
    if (token.startsWith('un') && nameTokens.has(token.slice(2))) return true;
  }
  return false;
}

/** "tablet" and "tablets" (and "tabs") are the same form. */
function sameForm(a: string, b: string): boolean {
  const normalise = (s: string) => (s === 'tabs' || s === 'tablet' ? 'tablets' : s);
  return normalise(a) === normalise(b);
}

/**
 * True when the line already contains every identity word of the candidate's
 * name (container words aside) and adds nothing but packaging noise.
 */
function lineNamesCandidate(inputTokens: Set<string>, name: string): boolean {
  if (inputTokens.size === 0) return false;
  const nameTokens = new Set(
    [...tokenSet(name)].filter((t) => t.length >= MIN_NAME_TOKEN && !CONTAINER_WORDS.has(t)),
  );
  if (nameTokens.size === 0) return false;
  for (const token of nameTokens) {
    if (!inputTokens.has(token)) return false;
  }
  for (const token of inputTokens) {
    if (token.length < MIN_NAME_TOKEN) continue;
    if (nameTokens.has(token) || CONTAINER_WORDS.has(token)) continue;
    if (!IGNORABLE_EXTRAS.has(token)) return false;
  }
  return true;
}

/**
 * Returns `null` when no comparable size was stated, otherwise how well the
 * stated size agrees with the candidate's (1 = exact).
 */
function computeSizeMatch(input: RankInput, row: RawCandidateRow): number | null {
  if (input.sizeValue == null || input.sizeUom == null) {
    return computePackMatch(input.quantity ?? null, row);
  }
  if (row.unitSizeValue == null || row.unitSizeUom == null) return null;
  const inputBase = toBaseUnit(input.sizeValue, input.sizeUom);
  const rowBase = toBaseUnit(row.unitSizeValue, row.unitSizeUom);
  // Different dimensions (grams against "each") are not a contradiction, they
  // are simply not comparable.
  if (rowBase.uom !== inputBase.uom) return null;
  const inputValue = inputBase.value;
  const rowValue = rowBase.value;
  if (inputValue === rowValue) return 1;
  const ratio = Math.min(inputValue, rowValue) / Math.max(inputValue, rowValue);
  if (ratio > 0.95) return 0.9;
  if (ratio > 0.8) return 0.6;
  if (ratio > 0.5) return 0.3;
  return 0;
}

/**
 * A stated pack count is a size signal for rows priced per unit: "18 eggs"
 * should pick the 18ea carton over the 12ea one rather than tie with it. Only
 * agreement is rewarded — a mismatch says nothing, because a shopper asking
 * for 3 avocados is not contradicting a 1ea row.
 */
function computePackMatch(quantity: number | null, row: RawCandidateRow): number | null {
  if (quantity == null) return null;
  if (row.unitSizeValue == null || row.unitSizeUom == null) return null;
  const uom = row.unitSizeUom.toLowerCase();
  if (uom !== 'ea' && uom !== 'pack' && uom !== 'each') return null;
  return row.unitSizeValue === quantity ? 1 : null;
}

function computeBrandMatch(
  inputBrand: string | null,
  rowBrand: string | null,
  brandSimilarity: number | undefined,
): number {
  if (!inputBrand || !rowBrand) return 0;
  if (inputBrand.toLowerCase() === rowBrand.toLowerCase()) return 1;
  return clamp01(brandSimilarity ?? 0);
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
