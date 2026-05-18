import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { createDb, createSqlClient, type Db } from '../db/client.ts';
import { retailerSkus, specials } from '../db/schema.ts';
import { loadEnv } from '../lib/env.ts';
import { createDbContext } from '../matching/db.ts';
import { matchLine } from '../matching/pipeline.ts';
import type { ConfidenceBand } from '../matching/types.ts';

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
  dryRun: boolean;
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

  try {
    const rows = await db
      .selectDistinctOn([specials.retailer, specials.retailerSku], {
        retailer: specials.retailer,
        retailerSku: specials.retailerSku,
        productName: specials.productName,
        brand: specials.brand,
        sizeText: specials.sizeText,
      })
      .from(specials)
      .where(
        and(
          isNotNull(specials.retailerSku),
          options.retailer ? eq(specials.retailer, options.retailer) : sql`true`,
        ),
      )
      .orderBy(specials.retailer, specials.retailerSku, desc(specials.updatedAt))
      .limit(options.limit);

    const ctx = createDbContext({
      db,
      openAiKey: env.OPENAI_API_KEY,
      openRouterKey: env.OPENROUTER_API_KEY,
      openRouterModel: env.OPENROUTER_MODEL,
    });

    for (const row of rows) {
      considered++;
      const queryText = [row.productName, row.brand ?? '', row.sizeText ?? '']
        .filter(Boolean)
        .join(' ');
      const match = await matchLine(queryText, ctx);
      bands[match.band] += 1;
      if (match.band === 'needs_attention') continue;
      if (options.dryRun) continue;
      if (!match.canonicalProductId) continue;
      const confidenceNum = clamp01(match.top?.finalScore ?? 0);
      await db
        .insert(retailerSkus)
        .values({
          retailer: row.retailer,
          retailerSku: row.retailerSku!,
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
        });
      upserts += 1;
    }

    return { ok: true, considered, bands, upserts, dryRun: options.dryRun };
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
