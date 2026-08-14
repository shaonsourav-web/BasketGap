import { SHORTHAND } from '../dictionaries/shorthand.ts';

const MAX_NGRAM = 3;

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
  return result.join(' ');
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
