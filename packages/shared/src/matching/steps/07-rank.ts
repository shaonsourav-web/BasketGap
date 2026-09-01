import { type MatchCandidate, RANK_WEIGHTS, type RawCandidateRow } from '../types.ts';
import { toBaseUnit } from '../lib/units.ts';

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
    const brandMatch = computeBrandMatch(input.brand, row.brand, row.brandSimilarity);

    const weightedSum = clamp01(
      RANK_WEIGHTS.text * textSimilarity +
        RANK_WEIGHTS.vector * vectorSimilarity +
        RANK_WEIGHTS.size * sizeMatch +
        RANK_WEIGHTS.brand * brandMatch +
        RANK_WEIGHTS.popularity * popularityPrior,
    );
    let finalScore = weightedSum;
    // Floors fire on NAME similarity only. Brand agreement can assist a decent
    // name match but must never carry a bad one into the matched band — the
    // engine once scored "arnotts shapes crackers" as Tim Tams on brand alone.
    if (textSimilarity >= 0.95) {
      finalScore = Math.max(finalScore, sizeMatch >= 1 ? 0.9 : 0.82);
    } else if (textSimilarity >= 0.7 && sizeMatch >= 1) {
      finalScore = Math.max(finalScore, 0.7);
    } else if (textSimilarity >= 0.7) {
      finalScore = Math.max(finalScore, 0.6);
    } else if (textSimilarity >= 0.65) {
      // Near-miss on name alone ("grated parmesan cheese" vs "Parmesan
      // Cheese" scores 0.696) — accept as assumed, never as matched. 0.65,
      // not 0.6: at 0.6 trigram noise sneaks junk in ("lollies party" scored
      // 0.6+ against Parmesan Cheese).
      finalScore = Math.max(finalScore, 0.55);
    } else if (brandMatch >= 0.9 && textSimilarity >= 0.45) {
      // Brand-first phrasing ("vegemite", "cadbury block 180g"): right brand
      // with moderate name overlap — accept as assumed, never as matched.
      finalScore = Math.max(
        finalScore,
        sizeMatch >= 0.9 ? Math.min(weightedSum + 0.25, 0.79) : 0.6,
      );
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
  const inputBase = toBaseUnit(input.sizeValue, input.sizeUom);
  const rowBase = toBaseUnit(row.unitSizeValue, row.unitSizeUom);
  if (rowBase.uom !== inputBase.uom) return 0;
  const inputValue = inputBase.value;
  const rowValue = rowBase.value;
  if (inputValue === rowValue) return 1;
  const ratio = Math.min(inputValue, rowValue) / Math.max(inputValue, rowValue);
  if (ratio > 0.95) return 0.9;
  if (ratio > 0.8) return 0.6;
  if (ratio > 0.5) return 0.3;
  return 0;
}

function computeBrandMatch(
  inputBrand: string | null,
  rowBrand: string | null,
  brandSimilarity: number | undefined,
): number {
  if (!inputBrand || !rowBrand) return 0;
  if (inputBrand.toLowerCase() === rowBrand.toLowerCase()) return 1;
  return clamp01(brandSimilarity ?? 0);
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
