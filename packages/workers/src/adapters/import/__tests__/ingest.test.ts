import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { importAdapter, ingestImport } from '../index.ts';

const EXAMPLES = fileURLToPath(new URL('../../../../examples/import/', import.meta.url));

describe('ingestImport (no network, no DB)', () => {
  it('dry-runs the JSON example without reading DATABASE_URL', async () => {
    const result = await ingestImport({
      fixturePath: `${EXAMPLES}specials.example.json`,
      dryRun: true,
      forceRefresh: false,
    });
    expect(result.skipped).toBe(true);
    expect(result.catalogueId).toBeNull();
    expect(result.reason).toBe('dry-run: no DB writes');
    expect(result.parsed.itemCount).toBe(5);
    expect(result.parsed.sourceUrl).toBe('import://specials.example.json');
    expect(result.parsed.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('dry-runs the CSV example and labels it from the file when no label is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'basketgap-import-'));
    const path = join(dir, 'Week-45.CSV');
    await writeFile(
      path,
      'retailer,source_type,product_name,special_price\ncoles,pdf,Test Rice 1kg,2\n',
    );
    const result = await ingestImport({ fixturePath: path, dryRun: true, forceRefresh: false });
    expect(result.parsed.sourceLabel).toBe('import:Week-45.CSV');
    expect(result.parsed.specials[0]).toMatchObject({ unitSizeValue: 1, unitSizeUom: 'kg' });

    const example = await ingestImport({
      fixturePath: `${EXAMPLES}specials.example.csv`,
      dryRun: true,
      forceRefresh: false,
    });
    expect(example.parsed.itemCount).toBe(5);
  });

  it('refuses URLs, unknown extensions and ambiguous sources', async () => {
    await expect(
      ingestImport({ sourceUrl: 'https://example.com/x.json', dryRun: true, forceRefresh: false }),
    ).rejects.toThrow(/local files only/);
    await expect(
      ingestImport({ fixturePath: 'specials.xlsx', dryRun: true, forceRefresh: false }),
    ).rejects.toThrow(/expects a \.json or \.csv file, got "\.xlsx"/);
    await expect(ingestImport({ dryRun: true, forceRefresh: false })).rejects.toThrow(
      /--source-url or --fixture/,
    );
  });

  it('is registered under the CLI name "import"', () => {
    expect(importAdapter.name).toBe('import');
    expect(importAdapter.ingest).toBe(ingestImport);
  });
});
