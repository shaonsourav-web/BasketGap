import { basename, extname } from 'node:path';

import { log } from '@basketgap/shared/lib/observability';
import { assertSingleSource, finishIngest } from '../_shared/pipeline.ts';
import { loadFromFixture } from '../_shared/source.ts';
import type { IngestAdapter, IngestOptions, IngestResult } from '../_shared/types.ts';

import { parseImportCsv, parseImportJson } from './parse.ts';

/**
 * Built-in, retailer-neutral adapter: reads a local JSON or CSV file in the
 * documented import format and runs it through the same dry-run / upsert tail
 * as every other adapter. It never touches the network.
 */
export async function ingestImport(options: IngestOptions): Promise<IngestResult> {
  assertSingleSource(options);
  if (!options.fixturePath) {
    throw new Error('The import adapter reads local files only; pass --file <path>.');
  }

  const extension = extname(options.fixturePath).toLowerCase();
  if (extension !== '.json' && extension !== '.csv') {
    throw new Error(
      `The import adapter expects a .json or .csv file, got "${extension || '(none)'}".`,
    );
  }

  const loaded = await loadFromFixture(options.fixturePath);
  const name = basename(options.fixturePath);
  // Record the file name, not the local path the contributor happened to use.
  const source = { ...loaded, value: `import://${name}` };
  log('info', 'import: loaded source', {
    bytes: source.bytes.byteLength,
    hash: source.hash.slice(0, 12),
  });

  const text = new TextDecoder('utf-8').decode(source.bytes);
  const label = `import:${name}`;
  const parsed =
    extension === '.json'
      ? parseImportJson(text, source, label)
      : parseImportCsv(text, source, label);
  for (const warning of parsed.warnings) log('warn', 'import: row skipped', { warning });
  log('info', 'import: parsed', {
    retailer: parsed.retailer,
    specials: parsed.specials.length,
    warnings: parsed.warnings.length,
  });

  return finishIngest(parsed, options, { adapter: 'import', source: source.value });
}

export const importAdapter: IngestAdapter = {
  name: 'import',
  description: 'Import specials from a JSON or CSV file in the BasketGap import format.',
  ingest: ingestImport,
};
