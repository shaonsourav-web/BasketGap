import { AMBIGUOUS_SHORTHAND, HEAD_DEFAULTS, SHORTHAND } from '../dictionaries/shorthand.ts';

const MAX_NGRAM = 3;

/**
 * Tokens that carry pack/size information rather than product identity. They
 * are ignored when testing a line against {@link HEAD_DEFAULTS} (and left in
 * place afterwards, so step 04 can still extract them).
 */
// QC 2026-09-02 F6: a bare "x" (and the pack abbreviations clean() does not
// always normalise) stopped the trim, so "3 x 1L milk" never reached the
// "milk" head default and deferred.
const SIZE_TOKENS = new Set(['l', 'ml', 'kg', 'g', 'ea', 'pack', 'dozen', 'x', 'pk', 'pkt']);

function isSizeToken(token: string): boolean {
  if (/^(x?\d+(\.\d+)?|\d+(\.\d+)?x)$/.test(token)) return true;
  return SIZE_TOKENS.has(token.toLowerCase());
}

export interface ShorthandExpansion {
  /** The expanded line, exactly what {@link expandShorthand} returns. */
  expanded: string;
  /**
   * True when the engine — not the shopper — chose the product identity:
   * either {@link HEAD_DEFAULTS} resolved a bare generic head ("coffee",
   * "rice", "milk 1 L") to a default variant, or an
   * {@link AMBIGUOUS_SHORTHAND} key ("detergent", "mince") was expanded to one
   * of several plausible products. The pipeline uses this to cap the
   * confidence band at `assumed`.
   */
  headDefaultApplied: boolean;
  /** `"coffee → coffee instant"`, for the audit trail. Empty when none fired. */
  headDefaultNote: string;
}

/** Convenience wrapper for callers that only need the expanded text. */
export function expandShorthand(cleaned: string): string {
  return expandShorthandDetailed(cleaned).expanded;
}

// Single pass by design: a second pass re-expands tokens inside completed
// expansions ("laundry detergent powder" → "laundry dishwashing liquid
// powder"). Phrases whose expansion would only become visible after another
// pass get their own direct keys instead ("salted crisps").
export function expandShorthandDetailed(cleaned: string): ShorthandExpansion {
  if (!cleaned) return { expanded: cleaned, headDefaultApplied: false, headDefaultNote: '' };
  const tokens = cleaned.split(' ');
  const result: string[] = [];
  const guesses: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let consumed = 0;
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 2; n--) {
      const phrase = tokens.slice(i, i + n).join(' ');
      const hit = SHORTHAND[phrase];
      if (hit) {
        pushExpansion(result, hit);
        if (AMBIGUOUS_SHORTHAND.has(phrase)) guesses.push(`${phrase} → ${hit}`);
        consumed = n + expansionOverlap(hit, tokens, i + n);
        break;
      }
    }
    if (consumed === 0) {
      const unigram = tokens[i]!;
      const hit = SHORTHAND[unigram];
      if (hit) {
        pushExpansion(result, hit);
        if (AMBIGUOUS_SHORTHAND.has(unigram)) guesses.push(`${unigram} → ${hit}`);
        consumed = 1 + expansionOverlap(hit, tokens, i + 1);
      } else {
        result.push(unigram);
        consumed = 1;
      }
    }
    i += consumed;
  }
  const head = applyHeadDefault(squashRepeats(result));
  const note = [head.note, ...guesses].filter(Boolean).join('; ');
  return {
    expanded: head.tokens.join(' '),
    headDefaultApplied: note !== '',
    headDefaultNote: note,
  };
}

/**
 * Drop a repeated token, keeping the first. Two expansions meeting head to
 * tail emit the same word twice ("brown bread" → "wholemeal bread", then the
 * shopper's own "wholemeal"), and no canonical name repeats a word — so a
 * repeat is pure similarity noise, and leaving it in was enough to sink
 * "brown bread wholemeal 700g" into silence.
 */
function squashRepeats(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Resolves a bare head to the catalogue's default variant — but **only when the
 * head is the whole line** once trailing size/pack tokens are set aside. So
 * "milk 1 L" becomes "full cream milk 1 L" while "almond milk", "soy milk" and
 * "skim milk" pass through untouched, and a line the catalogue cannot serve
 * ("snacks", "toothpaste") never acquires a default it did not ask for.
 */
function applyHeadDefault(tokens: string[]): { tokens: string[]; note: string } {
  let start = 0;
  while (start < tokens.length && isSizeToken(tokens[start]!)) start++;
  let end = tokens.length;
  while (end > start && isSizeToken(tokens[end - 1]!)) end--;
  if (end === start) return { tokens, note: '' };
  const head = tokens.slice(start, end).join(' ').toLowerCase();
  const hit = HEAD_DEFAULTS[head];
  // A key that maps to itself adds no assumption, so it is not reported.
  if (!hit || hit === head) return { tokens, note: '' };
  return {
    tokens: [...tokens.slice(0, start), ...hit.split(' '), ...tokens.slice(end)],
    note: `${head} → ${hit}`,
  };
}

/**
 * Push an expansion without re-emitting tokens the output already ends with —
 * "beef" followed by "mince" → "beef mince" must yield "beef mince", not
 * "beef beef mince".
 */
function pushExpansion(result: string[], expansion: string): void {
  const expTokens = expansion.split(' ');
  const maxK = Math.min(expTokens.length - 1, result.length);
  let skip = 0;
  for (let k = maxK; k >= 1; k--) {
    let matches = true;
    for (let j = 0; j < k; j++) {
      if (result[result.length - k + j] !== expTokens[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      skip = k;
      break;
    }
  }
  result.push(...expTokens.slice(skip));
}

/**
 * When an expansion already ends with the tokens that follow it in the input,
 * consume those tokens too so they are not emitted twice — e.g. the bigram
 * "full cream" → "full cream milk" followed by input token "milk" must yield
 * "full cream milk", not "full cream milk milk".
 */
function expansionOverlap(expansion: string, tokens: string[], from: number): number {
  const expTokens = expansion.split(' ');
  const maxK = Math.min(expTokens.length, tokens.length - from);
  for (let k = maxK; k >= 1; k--) {
    let matches = true;
    for (let j = 0; j < k; j++) {
      if (tokens[from + j] !== expTokens[expTokens.length - k + j]) {
        matches = false;
        break;
      }
    }
    if (matches) return k;
  }
  return 0;
}
