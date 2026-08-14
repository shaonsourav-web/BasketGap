import { inArray } from 'drizzle-orm';

import { createDb, createSqlClient, type Db, type SqlClient } from '@basketgap/shared/db/client';
import { canonicalProducts } from '@basketgap/shared/db/schema';
import { loadEnv } from '@basketgap/shared/lib/env';
import { embedText } from '@basketgap/shared/matching/lib/embeddings';
import { CANONICAL_SEED, type SeedEntry } from '@basketgap/shared/matching/seed/canonical-seed';
import { deterministicUuid } from '@basketgap/shared/matching/seed/uuid';

export interface SeedCanonicalOptions {
  dryRun: boolean;
  forceRefresh: boolean;
  db?: Db;
  sql?: SqlClient;
}

export interface SeedCanonicalResult {
  ok: boolean;
  totalSeed: number;
  alreadyPresent: number;
  inserted: number;
  refreshed: number;
  skipped: boolean;
  reason: string;
}

export async function seedCanonical(options: SeedCanonicalOptions): Promise<SeedCanonicalResult> {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY && !options.dryRun) {
    return {
      ok: false,
      totalSeed: CANONICAL_SEED.length,
      alreadyPresent: 0,
      inserted: 0,
      refreshed: 0,
      skipped: true,
      reason: 'OPENAI_API_KEY is required to embed seed entries (use --dry-run to plan)',
    };
  }

  const sql = options.sql ?? createSqlClient(env.DATABASE_URL);
  const db = options.db ?? createDb(sql);
  const shouldClose = !options.db;

  try {
    const entriesWithIds = CANONICAL_SEED.map((entry) => ({
      ...entry,
      id: idFor(entry),
    }));
    const ids = entriesWithIds.map((e) => e.id);
    const existing = await db
      .select({ id: canonicalProducts.id })
      .from(canonicalProducts)
      .where(inArray(canonicalProducts.id, ids));
    const existingSet = new Set(existing.map((r) => r.id));

    const toInsert = options.forceRefresh
      ? entriesWithIds
      : entriesWithIds.filter((e) => !existingSet.has(e.id));

    if (options.dryRun) {
      return {
        ok: true,
        totalSeed: entriesWithIds.length,
        alreadyPresent: existingSet.size,
        inserted: options.forceRefresh ? 0 : toInsert.length,
        refreshed: options.forceRefresh ? toInsert.length : 0,
        skipped: true,
        reason: 'dry-run: no DB writes, no embeddings called',
      };
    }

    let inserted = 0;
    let refreshed = 0;
    for (const entry of toInsert) {
      const embedInput = embedInputFor(entry);
      const embedding = await embedText(embedInput, { apiKey: env.OPENAI_API_KEY! });
      const existed = existingSet.has(entry.id);
      await db
        .insert(canonicalProducts)
        .values({
          id: entry.id,
          name: entry.name,
          brand: entry.brand,
          category: entry.category,
          unitSizeValue: entry.unitSizeValue != null ? String(entry.unitSizeValue) : null,
          unitSizeUom: entry.unitSizeUom,
          description: entry.description,
          embedding,
        })
        .onConflictDoUpdate({
          target: canonicalProducts.id,
          set: {
            name: entry.name,
            brand: entry.brand,
            category: entry.category,
            unitSizeValue: entry.unitSizeValue != null ? String(entry.unitSizeValue) : null,
            unitSizeUom: entry.unitSizeUom,
            description: entry.description,
            embedding,
            updatedAt: new Date(),
          },
        });
      if (existed) refreshed += 1;
      else inserted += 1;
    }

    return {
      ok: true,
      totalSeed: entriesWithIds.length,
      alreadyPresent: existingSet.size,
      inserted,
      refreshed,
      skipped: false,
      reason: options.forceRefresh
        ? 'force-refresh: embedded + upserted'
        : 'new + missing entries embedded + inserted',
    };
  } finally {
    if (shouldClose) {
      await sql.end({ timeout: 5 });
    }
  }
}

export function idFor(entry: SeedEntry): string {
  return deterministicUuid(
    entry.name,
    entry.brand,
    entry.category,
    entry.unitSizeUom ?? '',
    String(entry.unitSizeValue ?? ''),
  );
}

function embedInputFor(entry: SeedEntry): string {
  const parts = [entry.name];
  if (entry.brand) parts.push(`brand ${entry.brand}`);
  if (entry.unitSizeValue && entry.unitSizeUom)
    parts.push(`${entry.unitSizeValue}${entry.unitSizeUom}`);
  parts.push(entry.description);
  return parts.join(' — ');
}

export async function runSeedCanonical(argv: string[]): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const forceRefresh = argv.includes('--force-refresh');
  const result = await seedCanonical({ dryRun, forceRefresh });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}
