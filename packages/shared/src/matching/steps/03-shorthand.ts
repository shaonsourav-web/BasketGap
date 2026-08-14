import { HEAD_DEFAULTS, SHORTHAND } from '../dictionaries/shorthand.ts';

const MAX_NGRAM = 3;

/**
 * Tokens that carry pack/size information rather than product identity. They
 * are ignored when testing a line against {@link HEAD_DEFAULTS} (and left in
 * place afterwards, so step 04 can still extract them).
 */
const SIZE_TOKENS = new Set(['l', 'ml', 'kg', 'g', 'ea', 'pack', 'dozen']);

function isSizeToken(token: string): boolean {
  if (/^x?\d+(\.\d+)?$/.test(token)) return true;
  return SIZE_TOKENS.has(token.toLowerCase());
}

export function expandShorthand(cleaned: string): string {
  if (!cleaned) return cleaned;
  const tokens = cleaned.split(' ');
  const result: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let consumed = 0;
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 2; n--) {
      const phrase = tokens.slice(i, i + n).join(' ');
      const hit = SHORTHAND[phrase];
      if (hit) {
        result.push(hit);
        consumed = n + expansionOverlap(hit, tokens, i + n);
        break;
      }
    }
    if (consumed === 0) {
      const unigram = tokens[i]!;
      const hit = SHORTHAND[unigram];
      if (hit) {
        result.push(hit);
        consumed = 1 + expansionOverlap(hit, tokens, i + 1);
      } else {
        result.push(unigram);
        consumed = 1;
      }
    }
    i += consumed;
  }
  return applyHeadDefault(result).join(' ');
}

/**
 * Resolves a bare head to the catalogue's default variant — but **only when the
 * head is the whole line** once trailing size/pack tokens are set aside. So
 * "milk 1 L" becomes "full cream milk 1 L" while "almond milk", "soy milk" and
 * "skim milk" pass through untouched, and a line the catalogue cannot serve
 * ("snacks", "toothpaste") never acquires a default it did not ask for.
 */
function applyHeadDefault(tokens: string[]): string[] {
  let end = tokens.length;
  while (end > 0 && isSizeToken(tokens[end - 1]!)) end--;
  if (end === 0) return tokens;
  const hit = HEAD_DEFAULTS[tokens.slice(0, end).join(' ').toLowerCase()];
  if (!hit) return tokens;
  return [...hit.split(' '), ...tokens.slice(end)];
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
