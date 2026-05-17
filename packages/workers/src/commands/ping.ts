import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../lib/env.ts';
import { captureException } from '../lib/observability.ts';
import { createSqlClient } from '../db/client.ts';

type PingResult = {
  ok: true;
  postgres_version: string;
  node_version: string;
  drizzle_version: string;
  latency_ms: number;
  canonical_products_count: number;
};

function readDrizzleVersion(): string {
  // drizzle-orm doesn't expose ./package.json via exports, so read the declared
  // version from our own package.json (the version pnpm actually installed).
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  return pkg.dependencies?.['drizzle-orm'] ?? 'unknown';
}

export async function runPing(): Promise<number> {
  const env = loadEnv();
  const sql = createSqlClient(env.DATABASE_URL);
  const started = Date.now();
  try {
    const versionRows = await sql<{ version: string }[]>`select version() as version`;
    const countRows = await sql<
      { count: string }[]
    >`select count(*)::text as count from canonical_products`;

    const result: PingResult = {
      ok: true,
      postgres_version: versionRows[0]?.version ?? 'unknown',
      node_version: process.versions.node,
      drizzle_version: readDrizzleVersion(),
      latency_ms: Date.now() - started,
      canonical_products_count: Number(countRows[0]?.count ?? '0'),
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (err) {
    captureException(err, { command: 'ping' });
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
