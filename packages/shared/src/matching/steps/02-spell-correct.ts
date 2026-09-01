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
  'whole',
  'fresh',
  'small',
  'large',
  'litter',
  // one substitution from the shorthand key "parmy" → Parmesan Cheese
  'party',
]);

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
