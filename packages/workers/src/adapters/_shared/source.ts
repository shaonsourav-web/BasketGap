import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { CatalogueSource } from './types.ts';

/**
 * Reads a local file into a `CatalogueSource`. The SHA-256 of the bytes is the
 * catalogue's idempotency key (`catalogues.source_hash`), so re-ingesting the
 * same file is a no-op unless `--force-refresh` is passed.
 */
export async function loadFromFixture(fixturePath: string): Promise<CatalogueSource> {
  const absolute = resolve(process.cwd(), fixturePath);
  const buffer = await readFile(absolute);
  return {
    kind: 'fixture',
    value: `fixture://${fixturePath}`,
    fetchedAt: new Date(),
    bytes: new Uint8Array(buffer),
    hash: sha256(buffer),
  };
}

export function sha256(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}
