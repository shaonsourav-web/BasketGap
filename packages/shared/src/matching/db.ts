import { eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';
import { matchCache } from '../db/schema.ts';

import { embedText } from './lib/embeddings.ts';
import { hitsToPrior } from './lib/popularity.ts';
import { chooseWithLlm, DEFAULT_OPENROUTER_MODEL } from './lib/openrouter.ts';
import type {
  CachedMatch,
  LlmChooseInput,
  LlmChooseOutput,
  MatchCandidate,
  MatchResult,
  PipelineContext,
  RawCandidateRow,
} from './types.ts';

export interface DbContextOptions {
  db: Db;
  openAiKey?: string | undefined;
  openRouterKey?: string | undefined;
  openRouterModel?: string | undefined;
}

export function createDbContext(options: DbContextOptions): PipelineContext {
  const { db, openAiKey, openRouterKey, openRouterModel } = options;
  let knownBrandsPromise: Promise<string[]> | null = null;

  return {
    hasOpenAi: Boolean(openAiKey),
    hasOpenRouter: Boolean(openRouterKey),
    openRouterModel: openRouterModel ?? DEFAULT_OPENROUTER_MODEL,
    async embedText(text: string) {
      if (!openAiKey) throw new Error('embedText: OPENAI_API_KEY missing');
      return embedText(text, { apiKey: openAiKey });
    },
    async llmChoose(input: LlmChooseInput): Promise<LlmChooseOutput> {
      if (!openRouterKey) {
        return { chosenId: null, confidence: 0, reasoning: 'OPENROUTER_API_KEY missing' };
      }
      return chooseWithLlm(input, {
        apiKey: openRouterKey,
        model: openRouterModel ?? DEFAULT_OPENROUTER_MODEL,
      });
    },
    loadCandidatesByName: (cleaned, brand) => loadCandidatesByName(db, cleaned, brand),
    loadKnownBrands: () => {
      knownBrandsPromise ??= loadKnownBrands(db);
      return knownBrandsPromise;
    },
    loadCandidatesByVector: (embedding) => loadCandidatesByVector(db, embedding),
    readCache: (hash) => readCache(db, hash),
    writeCache: (hash, cleaned, result) => writeCache(db, hash, cleaned, result),
  };
}

async function loadKnownBrands(db: Db): Promise<string[]> {
  const rows = await db.execute<{ brand: string }>(sql`
    select distinct lower(brand) as brand
    from public.canonical_products
    where brand is not null
  `);
  return rows.map((r) => r.brand);
}

async function loadCandidatesByName(
  db: Db,
  cleaned: string,
  brand: string | null,
): Promise<RawCandidateRow[]> {
  if (!cleaned) return [];
  const rows = await db.execute<{
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    unit_size_value: string | null;
    unit_size_uom: string | null;
    text_similarity: number;
    brand_similarity: number;
    popularity_hits: number;
  }>(sql`
    select id,
           name,
           brand,
           category,
           unit_size_value::text as unit_size_value,
           unit_size_uom,
           similarity(lower(name), ${cleaned}) as text_similarity,
           case
             when ${brand}::text is not null and brand is not null
               then similarity(lower(brand), ${brand})
             else 0
           end as brand_similarity,
           coalesce((
             select sum(mc.hit_count)::int
             from public.match_cache mc
             where mc.canonical_product_id = canonical_products.id
           ), 0) as popularity_hits
    from public.canonical_products
    where similarity(lower(name), ${cleaned}) > 0.2
       or lower(name) = ${cleaned}
    order by greatest(
             similarity(lower(name), ${cleaned}),
             case
               when ${brand}::text is not null and brand is not null
                 then similarity(lower(brand), ${brand})
               else 0
             end
           ) desc
    limit 10
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    category: r.category,
    unitSizeValue: r.unit_size_value != null ? Number.parseFloat(r.unit_size_value) : null,
    unitSizeUom: r.unit_size_uom,
    textSimilarity: r.text_similarity,
    brandSimilarity: r.brand_similarity,
    popularityPrior: hitsToPrior(r.popularity_hits),
  }));
}

async function loadCandidatesByVector(db: Db, embedding: number[]): Promise<RawCandidateRow[]> {
  if (!embedding.length) return [];
  const literal = `[${embedding.join(',')}]`;
  const rows = await db.execute<{
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    unit_size_value: string | null;
    unit_size_uom: string | null;
    cosine_distance: number;
    popularity_hits: number;
  }>(sql`
    select id,
           name,
           brand,
           category,
           unit_size_value::text as unit_size_value,
           unit_size_uom,
           (embedding <=> ${literal}::vector) as cosine_distance,
           coalesce((
             select sum(mc.hit_count)::int
             from public.match_cache mc
             where mc.canonical_product_id = canonical_products.id
           ), 0) as popularity_hits
    from public.canonical_products
    where embedding is not null
    order by embedding <=> ${literal}::vector asc
    limit 10
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    category: r.category,
    unitSizeValue: r.unit_size_value != null ? Number.parseFloat(r.unit_size_value) : null,
    unitSizeUom: r.unit_size_uom,
    vectorSimilarity: clamp01(1 - r.cosine_distance),
    popularityPrior: hitsToPrior(r.popularity_hits),
  }));
}

async function readCache(db: Db, hash: string): Promise<CachedMatch | null> {
  const rows = await db
    .select({
      canonicalProductId: matchCache.canonicalProductId,
      confidenceBand: matchCache.confidenceBand,
      alternatives: matchCache.alternatives,
      decidedBy: matchCache.decidedBy,
    })
    .from(matchCache)
    .where(eq(matchCache.cleanedInputHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db
    .update(matchCache)
    .set({ hitCount: sql`${matchCache.hitCount} + 1`, lastUsedAt: new Date() })
    .where(eq(matchCache.cleanedInputHash, hash));
  return {
    canonicalProductId: row.canonicalProductId,
    confidenceBand: row.confidenceBand as CachedMatch['confidenceBand'],
    alternatives: (row.alternatives ?? []) as MatchCandidate[],
    decidedBy: row.decidedBy as CachedMatch['decidedBy'],
  };
}

async function writeCache(
  db: Db,
  hash: string,
  cleaned: string,
  result: MatchResult,
): Promise<void> {
  await db
    .insert(matchCache)
    .values({
      cleanedInputHash: hash,
      cleanedInput: cleaned,
      canonicalProductId: result.canonicalProductId,
      confidenceBand: result.band,
      alternatives: result.alternatives,
      decidedBy: result.decidedBy === 'cache' ? 'rank' : result.decidedBy,
      hitCount: 1,
      lastUsedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: matchCache.cleanedInputHash,
      set: {
        canonicalProductId: result.canonicalProductId,
        confidenceBand: result.band,
        alternatives: result.alternatives,
        decidedBy: result.decidedBy === 'cache' ? 'rank' : result.decidedBy,
        lastUsedAt: new Date(),
      },
    });
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
