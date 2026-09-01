import { HEAD_DEFAULTS, SHORTHAND } from '../dictionaries/shorthand.ts';
import { TYPOS } from '../dictionaries/typos.ts';
import { CANONICAL_SEED } from '../seed/canonical-seed.ts';

/**
 * The vocabulary has **two** roles, and QC 2026-09-02 (F1/F7) proved they must
 * not be the same list:
 *
 *  - `words` — everything the engine recognises as a real word. A token in here
 *    is never second-guessed by the fuzzy corrector.
 *  - `byLength` — the far smaller set of words the corrector is allowed to
 *    rewrite a token *into*.
 *
 * Before the split, every dictionary key was a correction target, so slang keys
 * silently became attractors: "straws" → "strawbs" → Strawberries Punnet at
 * `matched`, with "pepper" → "paper", "spices" → "slices" and "cups" → "caps"
 * one catalogue row from the same fate. Slang, category words and dictionary
 * expansions are still *known* (so they are never corrected away), but nothing
 * can be corrected *towards* them.
 */
export interface Vocabulary {
  /** Every known word. A token already in here is never "corrected". */
  readonly words: ReadonlySet<string>;
  /** Correction TARGETS only: word length → the words of that length, sorted. */
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
 * Builds a vocabulary from arbitrary phrases. `targetPhrases` supply both known
 * words and correction targets; `knownOnlyPhrases` supply words that are known
 * (never corrected away) but that nothing may be corrected *into*.
 * Deterministic: buckets are sorted, so the corrector's candidate scan order
 * never depends on insertion order.
 */
export function buildVocabulary(
  targetPhrases: Iterable<string>,
  knownOnlyPhrases: Iterable<string> = [],
): Vocabulary {
  const targets = new Set<string>();
  for (const phrase of targetPhrases) {
    for (const token of tokenise(phrase)) targets.add(token);
  }
  const words = new Set<string>(targets);
  for (const phrase of knownOnlyPhrases) {
    for (const token of tokenise(phrase)) words.add(token);
  }
  const byLength = new Map<number, string[]>();
  for (const word of [...targets].sort()) {
    const bucket = byLength.get(word.length);
    if (bucket) bucket.push(word);
    else byLength.set(word.length, [word]);
  }
  return { words, byLength };
}

/**
 * Correction TARGETS: canonical product **names**, **brands**, and the
 * **corrected spellings** in the typo table — the words a shopper is actually
 * trying to type. Nothing else may be invented by the corrector.
 */
function targetPhrases(): string[] {
  const phrases: string[] = [];
  for (const entry of CANONICAL_SEED) {
    phrases.push(entry.name);
    if (entry.brand) phrases.push(entry.brand);
  }
  phrases.push(...Object.values(TYPOS));
  return phrases;
}

/**
 * KNOWN-ONLY words — recognised, never corrected away, never corrected into:
 *
 * - canonical **categories** — protects real English words like "snacks" and
 *   "drinks" from being pulled onto a product word;
 * - **shorthand / head-default keys** — protects slang ("snags", "dishies") so
 *   the next step can expand it, without letting "straws" become "strawbs";
 * - **shorthand / head-default values** — every word the dictionaries emit is
 *   by definition a real grocery word ("beer", "sandwich"), so it must not be
 *   rewritten either ("beer" → "beef").
 */
function knownOnlyPhrases(): string[] {
  const phrases: string[] = [];
  for (const entry of CANONICAL_SEED) phrases.push(entry.category);
  phrases.push(...Object.keys(SHORTHAND), ...Object.values(SHORTHAND));
  phrases.push(...Object.keys(HEAD_DEFAULTS), ...Object.values(HEAD_DEFAULTS));
  return phrases;
}

/**
 * Built once at module load from the seed catalogue, so the corrector works
 * with zero API keys and no database — the degradation contract.
 */
export const SEED_VOCABULARY: Vocabulary = buildVocabulary(targetPhrases(), knownOnlyPhrases());
