import { createDb, createSqlClient } from '@basketgap/shared/db/client';
import { loadEnv } from '@basketgap/shared/lib/env';
import { captureException } from '@basketgap/shared/lib/observability';

import { persistCatalogue } from './persist.ts';
import type { IngestOptions, IngestResult, ParsedCatalogue } from './types.ts';

/** Every adapter takes exactly one of `--source-url` / `--fixture`. */
export function assertSingleSource(options: IngestOptions): void {
  const hasUrl = Boolean(options.sourceUrl);
  const hasFixture = Boolean(options.fixturePath);
  if (hasUrl && hasFixture) {
    throw new Error('Pass exactly one of --source-url or --fixture, not both.');
  }
  if (!hasUrl && !hasFixture) {
    throw new Error('Pass either --source-url or --fixture.');
  }
}

/**
 * The shared tail of every adapter: a dry run returns the parse without
 * touching the database (and without reading `DATABASE_URL`); otherwise the
 * catalogue is upserted by source hash in one transaction.
 */
export async function finishIngest(
  parsed: ParsedCatalogue,
  options: IngestOptions,
  context: { adapter: string; source: string },
): Promise<IngestResult> {
  if (options.dryRun) {
    return {
      catalogueId: null,
      specialsInserted: 0,
      skipped: true,
      reason: 'dry-run: no DB writes',
      parsed,
    };
  }

  const env = loadEnv();
  const sql = createSqlClient(env.DATABASE_URL);
  try {
    const db = createDb(sql);
    return await persistCatalogue(db, parsed, { forceRefresh: options.forceRefresh });
  } catch (err) {
    captureException(err, { adapter: context.adapter, source: context.source });
    throw err;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
