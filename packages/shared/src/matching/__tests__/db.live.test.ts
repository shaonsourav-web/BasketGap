import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { createDb, createSqlClient, type Db, type SqlClient } from '../../db/client.ts';
import { canonicalProducts, matchCache } from '../../db/schema.ts';
import { createDbContext } from '../db.ts';
import { matchLine } from '../pipeline.ts';
import { hashCleanedInput } from '../steps/09-cache.ts';

const SHOULD_RUN = Boolean(process.env.DATABASE_URL);
const describeIfDb = SHOULD_RUN ? describe : describe.skip;

const TEST_NAMESPACE = `round7-test-${Math.random().toString(36).slice(2, 10)}`;
const FIXTURES = [
  {
    id: '88888888-1111-1111-1111-000000000001',
    name: `${TEST_NAMESPACE} Full Cream Milk 2L`,
    brand: null,
    category: 'dairy',
    unitSizeValue: '2',
    unitSizeUom: 'L',
    description: 'fixture full cream milk',
  },
  {
    id: '88888888-1111-1111-1111-000000000002',
    name: `${TEST_NAMESPACE} UHT Long Life Milk 1L`,
    brand: null,
    category: 'dairy',
    unitSizeValue: '1',
    unitSizeUom: 'L',
    description: 'fixture UHT long life milk',
  },
  {
    id: '88888888-1111-1111-1111-000000000003',
    name: `${TEST_NAMESPACE} Tomato Sauce Bottle 500ml`,
    brand: null,
    category: 'pantry',
    unitSizeValue: '500',
    unitSizeUom: 'ml',
    description: 'fixture tomato sauce',
  },
];

function seededVector(seed: number): number[] {
  const out: number[] = new Array(1536);
  let s = seed;
  for (let i = 0; i < 1536; i++) {
    s = (s * 9301 + 49297) % 233280;
    out[i] = s / 233280 - 0.5;
  }
  return normalise(out);
}

function perturb(v: number[], magnitude: number): number[] {
  return normalise(v.map((x, i) => x + ((i * 13) % 7) * magnitude * 0.0001));
}

function normalise(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq) || 1;
  return v.map((x) => x / norm);
}

describeIfDb('matching db.ts integration', () => {
  let sql: SqlClient;
  let db: Db;
  const cacheHashes: string[] = [];

  beforeAll(async () => {
    sql = createSqlClient(process.env.DATABASE_URL!);
    db = createDb(sql);
    const vectorByIndex = [seededVector(101), seededVector(202), seededVector(303)];
    await db.insert(canonicalProducts).values(
      FIXTURES.map((f, i) => ({
        id: f.id,
        name: f.name,
        brand: f.brand,
        category: f.category,
        unitSizeValue: f.unitSizeValue,
        unitSizeUom: f.unitSizeUom,
        description: f.description,
        embedding: vectorByIndex[i] ?? null,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(canonicalProducts).where(
      inArray(
        canonicalProducts.id,
        FIXTURES.map((f) => f.id),
      ),
    );
    if (cacheHashes.length) {
      await db.delete(matchCache).where(inArray(matchCache.cleanedInputHash, cacheHashes));
    }
    await sql.end({ timeout: 5 });
  });

  it('direct-lookup finds the seeded row by trigram similarity', async () => {
    const ctx = createDbContext({ db });
    const candidates = await ctx.loadCandidatesByName(
      `${TEST_NAMESPACE} full cream milk 2 l`,
      null,
    );
    const ours = candidates.find((c) => c.id === FIXTURES[0]!.id);
    expect(ours).toBeDefined();
    expect(ours!.textSimilarity ?? 0).toBeGreaterThan(0.3);
  });

  it('vector-search orders by cosine distance', async () => {
    const ctx = createDbContext({ db });
    const queryVec = perturb(seededVector(101), 2);
    const candidates = await ctx.loadCandidatesByVector(queryVec);
    const ids = candidates.map((c) => c.id).filter((id) => FIXTURES.some((f) => f.id === id));
    expect(ids[0]).toBe(FIXTURES[0]!.id);
  });

  it('cache round-trips: writeCache → readCache returns the stored band + hit-count increments', async () => {
    const cleaned = `${TEST_NAMESPACE} round-trip cache test`;
    const hash = hashCleanedInput(cleaned);
    cacheHashes.push(hash);
    const ctx = createDbContext({ db });
    await ctx.writeCache(hash, cleaned, {
      raw: cleaned,
      cleaned,
      cleanedInputHash: hash,
      band: 'matched',
      decidedBy: 'direct',
      canonicalProductId: FIXTURES[0]!.id,
      top: null,
      alternatives: [],
      audit: [],
    });
    const first = await ctx.readCache(hash);
    expect(first).not.toBeNull();
    expect(first?.confidenceBand).toBe('matched');
    expect(first?.canonicalProductId).toBe(FIXTURES[0]!.id);
    const second = await ctx.readCache(hash);
    expect(second).not.toBeNull();
    const rows = await db
      .select({ hit: matchCache.hitCount })
      .from(matchCache)
      .where(inArray(matchCache.cleanedInputHash, [hash]));
    expect(rows[0]?.hit ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('pipeline end-to-end: matchLine returns matched band for the seeded fixture name', async () => {
    const ctx = createDbContext({ db });
    const result = await matchLine(`${TEST_NAMESPACE} Full Cream Milk 2L`, ctx);
    cacheHashes.push(result.cleanedInputHash);
    expect(result.band).not.toBe('needs_attention');
    expect(result.canonicalProductId).toBe(FIXTURES[0]!.id);
    expect(['direct', 'rank']).toContain(result.decidedBy);
  });

  it('pipeline cache hit: a second matchLine for the same input returns decidedBy=cache', async () => {
    const ctx = createDbContext({ db });
    const cleaned = `${TEST_NAMESPACE} Full Cream Milk 2L`;
    const a = await matchLine(cleaned, ctx);
    cacheHashes.push(a.cleanedInputHash);
    const b = await matchLine(cleaned, ctx);
    expect(b.decidedBy).toBe('cache');
  });

  it('pipeline needs_attention: garbage input returns needs_attention band', async () => {
    const ctx = createDbContext({ db });
    const result = await matchLine(`${TEST_NAMESPACE} xqzy zzgh blah`, ctx);
    cacheHashes.push(result.cleanedInputHash);
    expect(result.band).toBe('needs_attention');
  });
});
