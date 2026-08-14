const MAX_BRAND_NGRAM = 3;

export interface BrandExtract {
  brand: string | null;
  residual: string;
}

/**
 * Finds a known brand inside a cleaned line by longest n-gram match (up to
 * trigrams) against the catalogue-derived brand set, and removes it from the
 * residual so name similarity is computed against product words only.
 * "bega tasty cheese" → { brand: 'bega', residual: 'tasty cheese' }.
 * Brand names are expected lowercase (the catalogue query lowercases them).
 */
export function extractBrand(cleaned: string, knownBrands: ReadonlySet<string>): BrandExtract {
  if (!cleaned || knownBrands.size === 0) return { brand: null, residual: cleaned };
  const tokens = cleaned.split(' ');
  for (let n = Math.min(MAX_BRAND_NGRAM, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (knownBrands.has(phrase)) {
        const residual = [...tokens.slice(0, i), ...tokens.slice(i + n)].join(' ').trim();
        return { brand: phrase, residual };
      }
    }
  }
  return { brand: null, residual: cleaned };
}
