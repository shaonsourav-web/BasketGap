import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { createDb, createSqlClient, type Db } from '@basketgap/shared/db/client';
import { retailerSkus, specials } from '@basketgap/shared/db/schema';
import { loadEnv } from '@basketgap/shared/lib/env';
import { createDbContextFromEnv } from '@basketgap/shared/matching/db';
import { matchLine } from '@basketgap/shared/matching/pipeline';
import type { ConfidenceBand } from '@basketgap/shared/matching/types';

interface EnrichArgs {
  retailer: 'coles' | 'woolworths' | null;
  limit: number;
  dryRun: boolean;
}

export interface EnrichResult {
  ok: boolean;
  considered: number;
  bands: Record<ConfidenceBand, number>;
  upserts: number;
  specialsLinked: number;
  dryRun: boolean;
}

/**
 * The catalogue adapters rarely see a real retailer SKU (PDF and web sources
 * print product names, not SKUs), so identity falls back to a synthetic key
 * derived from the printed name + size. Stable across weekly re-ingests of the
 * same product; fits the retailer_skus (retailer, retailer_sku) unique key.
 */
export function syntheticSkuFor(productName: string, sizeText: string | null): string {
  const slug = `${productName} ${sizeText ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return `name:${slug}`;
}

function parseArgs(argv: string[]): EnrichArgs {
  let retailer: EnrichArgs['retailer'] = null;
  let limit = 100;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--retailer') {
      const v = argv[++i];
      if (v === 'coles' || v === 'woolworths') retailer = v;
    } else if (a === '--limit') {
      const v = argv[++i];
      if (v) limit = Number.parseInt(v, 10);
    } else if (a === '--dry-run') {
      dryRun = true;
    }
  }
  return { retailer, limit, dryRun };
}

export async function enrichSkus(options: EnrichArgs & { db?: Db }): Promise<EnrichResult> {
  const env = loadEnv();
  const shouldClose = !options.db;
  const sqlClient = shouldClose ? createSqlClient(env.DATABASE_URL) : null;
  const db = options.db ?? createDb(sqlClient!);

  const bands: Record<ConfidenceBand, number> = {
    matched: 0,
    assumed: 0,
    needs_attention: 0,
  };
  let considered = 0;
  let upserts = 0;
  let specialsLinked = 0;

  try {
    const identity = sql`coalesce(${specials.retailerSku}, ${specials.productName} || '|' || coalesce(${specials.sizeText}, ''))`;
    const rows = await db
      .selectDistinctOn([specials.retailer, identity], {
        retailer: specials.retailer,
        retailerSku: specials.retailerSku,
        productName: specials.productName,
        brand: specials.brand,
        sizeText: specials.sizeText,
      })
      .from(specials)
      .where(options.retailer ? eq(specials.retailer, options.retailer) : sql`true`)
      .orderBy(specials.retailer, identity, desc(specials.updatedAt))
      .limit(options.limit);

    const ctx = createDbContextFromEnv(db, env);

    for (const row of rows) {
      considered++;
      // Match on the printed product name; append the size only when the name
      // doesn't already carry it. Appending the catalogue brand is harmful —
      // the canonical seed is mostly unbranded, and a mismatched brand token
      // drags a clean name match down into needs_attention.
      const name = row.productName;
      const size = row.sizeText ?? '';
      const queryText =
        size && !name.toLowerCase().includes(size.toLowerCase()) ? `${name} ${size}` : name;
      const match = await matchLine(queryText, ctx);
      bands[match.band] += 1;
      if (match.band === 'needs_attention') continue;
      if (options.dryRun) continue;
      if (!match.canonicalProductId) continue;
      const confidenceNum = clamp01(match.top?.finalScore ?? 0);
      const skuKey = row.retailerSku ?? syntheticSkuFor(row.productName, row.sizeText);
      const [linked] = await db
        .insert(retailerSkus)
        .values({
          retailer: row.retailer,
          retailerSku: skuKey,
          canonicalProductId: match.canonicalProductId,
          lastSeenName: row.productName,
          lastSeenAt: new Date(),
          matchConfidence: confidenceNum.toFixed(2),
        })
        .onConflictDoUpdate({
          target: [retailerSkus.retailer, retailerSkus.retailerSku],
          set: {
            canonicalProductId: match.canonicalProductId,
            lastSeenName: row.productName,
            lastSeenAt: new Date(),
            matchConfidence: confidenceNum.toFixed(2),
            updatedAt: new Date(),
          },
        })
        .returning({ id: retailerSkus.id });
      upserts += 1;

      // Backfill the specials → retailer_skus link the offers join depends on.
      // Nothing else writes specials.retailer_sku_id (persist leaves it null).
      if (linked) {
        const updated = await db
          .update(specials)
          .set({ retailerSkuId: linked.id })
          .where(
            and(
              eq(specials.retailer, row.retailer),
              row.retailerSku != null
                ? eq(specials.retailerSku, row.retailerSku)
                : and(
                    isNull(specials.retailerSku),
                    eq(specials.productName, row.productName),
                    row.sizeText != null
                      ? eq(specials.sizeText, row.sizeText)
                      : isNull(specials.sizeText),
                  ),
            ),
          )
          .returning({ id: specials.id });
        specialsLinked += updated.length;
      }
    }

    return { ok: true, considered, bands, upserts, specialsLinked, dryRun: options.dryRun };
  } finally {
    if (shouldClose && sqlClient) await sqlClient.end({ timeout: 5 });
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export async function runEnrichSkus(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const result = await enrichSkus(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}
