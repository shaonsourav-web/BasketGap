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
        consumed = n;
        break;
      }
    }
    if (consumed === 0) {
      const unigram = tokens[i]!;
      result.push(SHORTHAND[unigram] ?? unigram);
      consumed = 1;
    }
    i += consumed;
  }
  return result.join(' ');
}
