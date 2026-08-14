import { TYPOS } from '../dictionaries/typos.ts';

export function spellCorrect(cleaned: string): string {
  const tokens = cleaned.split(' ');
  const corrected = tokens.map((token) => {
    const lookup = token.toLowerCase();
    return TYPOS[lookup] ?? token;
  });
  return corrected.join(' ');
}
