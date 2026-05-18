import { type MatchCandidate, RANK_WEIGHTS, type RawCandidateRow } from '../types.ts';

export interface RankInput {
  cleaned: string;
  brand: string | null;
  sizeValue: number | null;
  sizeUom: string | null;
  directCandidates: RawCandidateRow[];
  vectorCandidates: RawCandidateRow[];
}

export function rankCandidates(input: RankInput): MatchCandidate[] {
  const merged = new Map<string, RawCandidateRow>();
  for (const row of input.directCandidates) {
    merged.set(row.id, { ...row });
  }
  for (const row of input.vectorCandidates) {
    const existing = merged.get(row.id);
    merged.set(row.id, existing ? { ...existing, ...row } : { ...row });
  }

  const candidates: MatchCandidate[] = [];
  for (const row of merged.values()) {
    const textSimilarity = clamp01(row.textSimilarity ?? 0);
    const vectorSimilarity = clamp01(row.vectorSimilarity ?? 0);
    const popularityPrior = clamp01(row.popularityPrior ?? 0);
    const sizeMatch = computeSizeMatch(input, row);
    const brandMatch = computeBrandMatch(input.brand, row.brand);

    const weightedSum = clamp01(
      RANK_WEIGHTS.text * textSimilarity +
        RANK_WEIGHTS.vector * vectorSimilarity +
        RANK_WEIGHTS.size * sizeMatch +
        RANK_WEIGHTS.brand * brandMatch +
        RANK_WEIGHTS.popularity * popularityPrior,
    );
    let finalScore = weightedSum;
    if (textSimilarity >= 0.95) {
      finalScore = Math.max(finalScore, sizeMatch >= 1 ? 0.9 : 0.82);
    } else if (textSimilarity >= 0.7 && sizeMatch >= 1) {
      finalScore = Math.max(finalScore, 0.7);
    } else if (textSimilarity >= 0.7) {
      finalScore = Math.max(finalScore, 0.6);
    }

    candidates.push({
      canonicalProductId: row.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      unitSizeValue: row.unitSizeValue,
      unitSizeUom: row.unitSizeUom,
      textSimilarity,
      vectorSimilarity,
      sizeMatch,
      brandMatch,
      popularityPrior,
      finalScore,
    });
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);
  return candidates.slice(0, 10);
}

function computeSizeMatch(input: RankInput, row: RawCandidateRow): number {
  if (input.sizeValue == null || input.sizeUom == null) return 0;
  if (row.unitSizeValue == null || row.unitSizeUom == null) return 0;
  if (row.unitSizeUom !== input.sizeUom) return 0;
  const inputValue = input.sizeValue;
  const rowValue = row.unitSizeValue;
  if (inputValue === rowValue) return 1;
  const ratio = Math.min(inputValue, rowValue) / Math.max(inputValue, rowValue);
  if (ratio > 0.95) return 0.9;
  if (ratio > 0.8) return 0.6;
  if (ratio > 0.5) return 0.3;
  return 0;
}

function computeBrandMatch(inputBrand: string | null, rowBrand: string | null): number {
  if (!inputBrand) return 0;
  if (!rowBrand) return 0;
  if (inputBrand.toLowerCase() === rowBrand.toLowerCase()) return 1;
  return 0;
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
