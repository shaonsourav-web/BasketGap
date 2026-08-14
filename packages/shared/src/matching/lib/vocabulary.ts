import { HEAD_DEFAULTS, SHORTHAND } from '../dictionaries/shorthand.ts';
import { TYPOS } from '../dictionaries/typos.ts';
import { CANONICAL_SEED } from '../seed/canonical-seed.ts';

/**
 * The set of words the fuzzy spell corrector is allowed to correct *towards*,
 * bucketed by length so a lookup only ever scans the few buckets that can hold
 * a word within the allowed edit distance.
 */
export interface Vocabulary {
  /** Every known word. A token already in here is never "corrected". */
  readonly words: ReadonlySet<string>;
  /** word length → the words of that length, in stable sorted order. */
  readonly byLength: ReadonlyMap<number, readonly string[]>;
}

/** Words shorter than this are neither correction sources nor targets. */
const MIN_VOCAB_WORD = 3;

function tokenise(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length >= MIN_VOCAB_WORD);
}

/**
 * Builds a vocabulary from arbitrary phrases (product names, brands, dictionary
 * entries). Deterministic: buckets are sorted, so the corrector's candidate
 * scan order never depends on insertion order.
 */
export function buildVocabulary(phrases: Iterable<string>): Vocabulary {
  const words = new Set<string>();
  for (const phrase of phrases) {
    for (const token of tokenise(phrase)) words.add(token);
  }
  const byLength = new Map<number, string[]>();
  for (const word of [...words].sort()) {
    const bucket = byLength.get(word.length);
    if (bucket) bucket.push(word);
    else byLength.set(word.length, [word]);
  }
  return { words, byLength };
}

/**
 * Phrases the offline vocabulary is derived from:
 *
 * - canonical product **names** and **brands** — the words a shopper is
 *   actually trying to type;
 * - canonical **categories** — protects real English words like "snacks" and
 *   "drinks" from being "corrected" into a product word;
 * - **shorthand / head-default keys** — protects slang ("snags", "dishies")
 *   and lets a typo'd abbreviation snap back onto a key the next step expands;
 * - **typo-table values** (the corrected spellings, never the misspellings) —
 *   so the fuzzy pass and the exact table agree on what a correct word is.
 *
 * Built once at module load from the seed catalogue, so the corrector works
 * with zero API keys and no database — the degradation contract.
 */
function seedPhrases(): string[] {
  const phrases: string[] = [];
  for (const entry of CANONICAL_SEED) {
    phrases.push(entry.name);
    if (entry.brand) phrases.push(entry.brand);
    phrases.push(entry.category);
  }
  phrases.push(...Object.keys(SHORTHAND));
  phrases.push(...Object.keys(HEAD_DEFAULTS));
  phrases.push(...Object.values(TYPOS));
  return phrases;
}

export const SEED_VOCABULARY: Vocabulary = buildVocabulary(seedPhrases());
