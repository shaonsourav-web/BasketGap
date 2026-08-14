/**
 * Optimal String Alignment (restricted Damerau–Levenshtein) distance.
 *
 * Counts insertions, deletions, substitutions and **adjacent transpositions**
 * ("onoins" → "onions" costs 1, not 2), which is exactly the class of typo a
 * shopper produces on a phone keyboard. The restricted variant is used on
 * purpose: it is a simple three-row dynamic program with no dependencies, and
 * the unrestricted variant's extra power (editing a substring twice) is
 * irrelevant at the distance bounds we allow (≤ 2).
 *
 * `max` bounds the work: as soon as an entire row exceeds `max` the function
 * short-circuits and returns `max + 1`, which callers read as "further than
 * allowed". The return value is therefore only exact when it is ≤ `max`.
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > max) return max + 1;

  // Three rows: i-2, i-1 and the row being filled.
  let twoAgo: number[] = new Array<number>(lb + 1).fill(0);
  let prev: number[] = new Array<number>(lb + 1);
  let current: number[] = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoAgo[j - 2]! + cost); // transposition
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    const recycled = twoAgo;
    twoAgo = prev;
    prev = current;
    current = recycled;
  }

  return prev[lb]!;
}
