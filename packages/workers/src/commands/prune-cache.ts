import { createDb, createSqlClient } from '@basketgap/shared/db/client';
import { loadEnv } from '@basketgap/shared/lib/env';
import { captureException } from '@basketgap/shared/lib/observability';
import {
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_MAX_ROWS,
  pruneMatchCache,
} from '@basketgap/shared/matching/cache-prune';

export interface PruneCacheArgs {
  maxAgeDays: number;
  maxRows: number;
}

export function parseArgs(argv: string[]): PruneCacheArgs {
  let maxAgeDays = DEFAULT_MAX_AGE_DAYS;
  let maxRows = DEFAULT_MAX_ROWS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-age-days') {
      const v = Number.parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(v) && v > 0) maxAgeDays = v;
    } else if (a === '--max-rows') {
      const v = Number.parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(v) && v > 0) maxRows = v;
    }
  }
  return { maxAgeDays, maxRows };
}

export async function runPruneCache(argv: string[]): Promise<number> {
  const { maxAgeDays, maxRows } = parseArgs(argv);
  const env = loadEnv();
  const sqlClient = createSqlClient(env.DATABASE_URL);
  const db = createDb(sqlClient);
  try {
    const result = await pruneMatchCache(db, { maxAgeDays, maxRows });
    process.stdout.write(JSON.stringify({ ok: true, maxAgeDays, maxRows, ...result }) + '\n');
    return 0;
  } catch (err) {
    captureException(err, { command: 'prune-cache' });
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
    return 1;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}
