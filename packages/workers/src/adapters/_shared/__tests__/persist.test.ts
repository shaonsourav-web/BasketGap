import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb, createSqlClient, type Db, type SqlClient } from '@basketgap/shared/db/client';
import { catalogues, specials } from '@basketgap/shared/db/schema';
import { ingestImport } from '../../import/index.ts';
import { persistCatalogue } from '../persist.ts';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const EXAMPLE = fileURLToPath(
  new URL('../../../../examples/import/specials.example.json', import.meta.url),
);

/**
 * Integration test for the shared upsert, driven by the synthetic import
 * example. Skipped without DATABASE_URL (CI has none).
 */
describeIfDb('persistCatalogue via the import adapter (integration)', () => {
  let sql: SqlClient;
  let db: Db;
  let sourceHash: string;

  beforeAll(async () => {
    sql = createSqlClient(databaseUrl!);
    db = createDb(sql);
    const dry = await ingestImport({ fixturePath: EXAMPLE, dryRun: true, forceRefresh: false });
    sourceHash = dry.parsed.sourceHash;
    // Start clean in case an earlier run against this database was interrupted.
    await db.delete(catalogues).where(eq(catalogues.sourceHash, sourceHash));
  });

  afterAll(async () => {
    try {
      await db.delete(catalogues).where(eq(catalogues.sourceHash, sourceHash));
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('inserts a new catalogue and its specials', async () => {
    const dry = await ingestImport({ fixturePath: EXAMPLE, dryRun: true, forceRefresh: false });
    const result = await persistCatalogue(db, dry.parsed, { forceRefresh: false });
    expect(result.skipped).toBe(false);
    expect(result.catalogueId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.specialsInserted).toBe(5);

    const cats = await db.select().from(catalogues).where(eq(catalogues.sourceHash, sourceHash));
    expect(cats).toHaveLength(1);
    expect(cats[0]?.retailer).toBe('coles');
    expect(cats[0]?.sourceType).toBe('pdf');
    expect(cats[0]?.validFrom).toBe('2026-11-04');
    expect(cats[0]?.itemCount).toBe(5);
  });

  it('skips re-ingestion of identical bytes', async () => {
    const dry = await ingestImport({ fixturePath: EXAMPLE, dryRun: true, forceRefresh: false });
    const result = await persistCatalogue(db, dry.parsed, { forceRefresh: false });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/already ingested/);
    expect(result.specialsInserted).toBe(0);
  });

  it('replaces children on force-refresh', async () => {
    const dry = await ingestImport({ fixturePath: EXAMPLE, dryRun: true, forceRefresh: false });
    const result = await persistCatalogue(db, dry.parsed, { forceRefresh: true });
    expect(result.skipped).toBe(false);
    expect(result.specialsInserted).toBe(5);

    const items = await db
      .select()
      .from(specials)
      .where(eq(specials.catalogueId, result.catalogueId!));
    expect(items).toHaveLength(5);
  });
});
