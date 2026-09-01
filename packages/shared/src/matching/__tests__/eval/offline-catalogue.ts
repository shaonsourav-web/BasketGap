import { CANONICAL_SEED, type SeedEntry } from '../../seed/canonical-seed.ts';
import { canonicalSeedId } from '../../seed/uuid.ts';
import type { PipelineContext, RawCandidateRow } from '../../types.ts';

import { trigramSimilarity } from './pg-trgm.ts';

export interface CatalogueRow extends SeedEntry {
  id: string;
}

/** Shares `canonicalSeedId` with the live seeder, so the in-memory catalogue
 * carries the ids the live catalogue would carry. */
export const CATALOGUE: CatalogueRow[] = CANONICAL_SEED.map((entry) => ({
  ...entry,
  id: canonicalSeedId(entry),
}));

/** Distinct lowercased brands — mirrors `loadKnownBrands` in `matching/db.ts`. */
export const KNOWN_BRANDS: string[] = [
  ...new Set(CATALOGUE.filter((r) => r.brand).map((r) => r.brand!.toLowerCase())),
];

/** The set of canonical names the labelled fixture is allowed to reference. */
export const CANONICAL_NAMES = new Set(CATALOGUE.map((r) => r.name.toLowerCase()));

function toRow(
  row: CatalogueRow,
  textSimilarity: number,
  brandSimilarity: number,
): RawCandidateRow {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    unitSizeValue: row.unitSizeValue,
    unitSizeUom: row.unitSizeUom,
    textSimilarity,
    brandSimilarity,
    // No `match_cache` offline, so every row's popularity prior is 0 — the same
    // value a cold production catalogue would report before any traffic.
    popularityPrior: 0,
  };
}

/**
 * In-memory equivalent of the `loadCandidatesByName` query in `matching/db.ts`:
 * name similarity and brand similarity reported separately, filtered on name
 * similarity > 0.2 (or an exact lowercase name equality), ordered by the
 * greatest of the two, limit 10.
 */
export function loadCandidatesByName(cleaned: string, brand: string | null): RawCandidateRow[] {
  if (!cleaned) return [];
  const rows: Array<{ row: CatalogueRow; nameSim: number; brandSim: number; best: number }> = [];
  for (const row of CATALOGUE) {
    const nameSim = trigramSimilarity(row.name.toLowerCase(), cleaned);
    const brandSim =
      brand && row.brand ? trigramSimilarity(row.brand.toLowerCase(), brand.toLowerCase()) : 0;
    if (nameSim > 0.2 || row.name.toLowerCase() === cleaned) {
      rows.push({ row, nameSim, brandSim, best: Math.max(nameSim, brandSim) });
    }
  }
  rows.sort((a, b) => b.best - a.best || a.row.name.localeCompare(b.row.name));
  return rows.slice(0, 10).map((r) => toRow(r.row, r.nameSim, r.brandSim));
}

/**
 * Builds the offline pipeline context: no Gemini key, no database, no cache.
 * The vector step short-circuits on `hasEmbeddings: false` and the LLM
 * fallback on `hasLlm: false`, so the harness measures the deterministic
 * path only. Cache reads always miss so each labelled line is scored
 * independently of the order the fixture happens to be written in.
 */
export function createOfflineContext(): PipelineContext {
  return {
    hasEmbeddings: false,
    hasLlm: false,
    llmModel: 'offline-eval',
    embedText: () => Promise.reject(new Error('eval harness must not call embedText')),
    llmChoose: () => Promise.reject(new Error('eval harness must not call llmChoose')),
    loadCandidatesByName: (cleaned, brand) => Promise.resolve(loadCandidatesByName(cleaned, brand)),
    loadKnownBrands: () => Promise.resolve(KNOWN_BRANDS),
    loadCandidatesByVector: () => Promise.resolve([]),
    readCache: () => Promise.resolve(null),
    writeCache: () => Promise.resolve(),
  };
}
