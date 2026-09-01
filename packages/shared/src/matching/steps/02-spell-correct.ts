import { TYPOS } from '../dictionaries/typos.ts';
import { editDistance } from '../lib/edit-distance.ts';
import { SEED_VOCABULARY, type Vocabulary } from '../lib/vocabulary.ts';

/** Tokens shorter than this are never corrected — too little signal, too many neighbours. */
export const MIN_CORRECTABLE_LENGTH = 4;
/** From this length a second edit is allowed (double-tap / dropped-letter typos). */
export const LONG_TOKEN_LENGTH = 6;

const WORD_LIKE = /^[a-z][a-z'-]*$/;

/**
 * Real grocery-list words that are not in the catalogue vocabulary but sit one
 * edit from something that is ("grated" → "grapes", "clean" → "lean"). Never
 * fuzzy-corrected; the exact TYPOS table still applies.
 */
const PROTECTED_WORDS = new Set([
  'grated',
  'shredded',
  'sliced',
  'raw',
  'plain',
  'clean',
  'pears',
  // QC 2026-09-02 F5: the singular half was missing, so "pear" → "peas" →
  // Frozen Peas. Any protected word's other number must be protected too.
  'pear',
  'whole',
  'fresh',
  'small',
  'large',
  'litter',
  // one substitution from the shorthand key "parmy" → Parmesan Cheese
  'party',
  // QC 2026-09-02 F1: drinking straws are not strawberries.
  'straw',
  'straws',
  // one substitution from "cola" (Coca Cola) / "caps" (capsicum shorthand)
  'cold',
  'cats',
  'cups',
  // one substitution from a canonical word: "slices", "beef", "black"
  'spices',
  'beer',
  'bleach',
  'pepper',
  'babies',
  'pastry',
  // one substitution from "bags" (English Breakfast Tea Bags)
  'bar',
  'bars',
]);

/**
 * A missing space is a different defect from a typo: "oatmilk" is not one edit
 * from anything, it is two known words run together. Split it only when the
 * decomposition is unambiguous — a single split point yielding two words the
 * catalogue already knows — so nothing is invented.
 */
const MIN_COMPOUND_LENGTH = 6;
const MIN_COMPOUND_PART = 3;

export function splitCompound(token: string, vocabulary: Vocabulary): string | null {
  if (token.length < MIN_COMPOUND_LENGTH) return null;
  if (!WORD_LIKE.test(token)) return null;
  if (vocabulary.words.has(token)) return null;
  let found: string | null = null;
  for (let i = MIN_COMPOUND_PART; i <= token.length - MIN_COMPOUND_PART; i++) {
    const left = token.slice(0, i);
    const right = token.slice(i);
    if (!vocabulary.words.has(left) || !vocabulary.words.has(right)) continue;
    if (found) return null; // more than one legal split — ambiguous, leave it
    found = `${left} ${right}`;
  }
  return found;
}

/**
 * Spell correction, two passes:
 *
 * 1. the hand-curated `TYPOS` table — an exact-match fast path, kept because it
 *    encodes corrections fuzzy matching cannot infer ("yoghurt" → "yogurt" is a
 *    spelling *variant*, not a typo, and "mlk" is below the fuzzy floor);
 * 2. a bounded fuzzy pass against the catalogue-derived vocabulary.
 *
 * The fuzzy pass is deliberately conservative — its job is to rescue real
 * products, never to invent a match for a line the catalogue does not carry:
 *
 * - tokens under {@link MIN_CORRECTABLE_LENGTH} characters are left alone;
 * - non-word tokens (numbers, sizes, units) are left alone;
 * - a token already in the vocabulary is never second-guessed;
 * - the budget is 1 edit, or 2 for tokens of {@link LONG_TOKEN_LENGTH}+;
 * - **ties lose**: if two different vocabulary words sit at the same best
 *   distance the token is ambiguous and stays exactly as typed.
 */
export function spellCorrect(cleaned: string, vocabulary: Vocabulary = SEED_VOCABULARY): string {
  if (!cleaned) return cleaned;
  return cleaned
    .split(' ')
    .map((token) => {
      const lookup = token.toLowerCase();
      const exact = TYPOS[lookup];
      if (exact) return exact;
      const split = splitCompound(lookup, vocabulary);
      if (split) return split;
      return fuzzyCorrect(lookup, vocabulary) ?? token;
    })
    .join(' ');
}

/**
 * Returns the single closest vocabulary word within the edit budget, or `null`
 * when the token is out of scope, already known, too far from everything, or
 * ambiguous between two equally close words.
 */
export function fuzzyCorrect(
  token: string,
  vocabulary: Vocabulary = SEED_VOCABULARY,
): string | null {
  if (token.length < MIN_CORRECTABLE_LENGTH) return null;
  if (!WORD_LIKE.test(token)) return null;
  if (vocabulary.words.has(token)) return null;
  if (PROTECTED_WORDS.has(token)) return null;

  const budget = token.length >= LONG_TOKEN_LENGTH ? 2 : 1;
  const initial = token[0];
  let best: string | null = null;
  let bestDistance = budget + 1;
  let ambiguous = false;

  for (let length = token.length - budget; length <= token.length + budget; length++) {
    for (const candidate of vocabulary.byLength.get(length) ?? []) {
      // Real typos overwhelmingly preserve the first letter; requiring it
      // stops the corrector rewriting legitimate words the vocabulary lacks
      // ("clean" → "lean") while keeping genuine fat-finger rescues.
      if (candidate[0] !== initial) continue;
      // A short real word is one deletion away from many vocabulary words
      // ("pears" → "peas"); a short token may only shrink when it carries a
      // doubled letter — the classic double-tap typo ("milkk" → "milk") —
      // and no token may shrink by more than one character ("litter" must
      // never become "lite").
      if (candidate.length < token.length - 1) continue;
      if (
        candidate.length < token.length &&
        token.length < LONG_TOKEN_LENGTH &&
        !/(.)\1/.test(token)
      )
        continue;
      const distance = editDistance(token, candidate, budget);
      if (distance > budget) continue;
      // QC 2026-09-02 F1: a two-edit budget is wide enough to rewrite real
      // English words into catalogue words that merely rhyme with them
      // ("pepper" → "paper"). Two edits are only allowed to a word that keeps
      // the token's first two characters, or that is an adjacent transposition
      // of it — the shapes an actual fat-finger typo takes ("mlik" → "milk").
      if (distance === 2 && candidate[1] !== token[1] && !isTransposition(token, candidate)) {
        continue;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
        ambiguous = false;
      } else if (distance === bestDistance && candidate !== best) {
        ambiguous = true;
      }
    }
  }

  return ambiguous ? null : best;
}

/** True when the two equal-length words differ only by one swap of neighbours. */
function isTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i >= a.length - 1) return false;
  if (a[i] !== b[i + 1] || a[i + 1] !== b[i]) return false;
  for (let j = i + 2; j < a.length; j++) {
    if (a[j] !== b[j]) return false;
  }
  return true;
}
