/**
 * Offline stand-in for PostgreSQL's `pg_trgm` `similarity()`.
 *
 * The eval harness runs without a database, but the deterministic half of the
 * matching pipeline is driven almost entirely by `similarity(lower(name), …)`
 * in `matching/db.ts`. Re-implementing pg_trgm's exact trigram model here keeps
 * the offline baseline representative of the live one:
 *
 *  - input is lowercased and every non-alphanumeric character is a word break;
 *  - each word `w` contributes the 3-character windows of `"  " + w + " "`
 *    (so `milk` → `"  m"`, `" mi"`, `"mil"`, `"ilk"`, `"lk "`);
 *  - trigrams are de-duplicated into a set;
 *  - `similarity(a, b) = |A ∩ B| / |A ∪ B|`.
 *
 * This is measurement-only code. Nothing here is imported by the pipeline.
 */

export function trigrams(input: string): Set<string> {
  const out = new Set<string>();
  const words = input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      out.add(padded.slice(i, i + 3));
    }
  }
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const t of left) {
    if (right.has(t)) shared += 1;
  }
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}
