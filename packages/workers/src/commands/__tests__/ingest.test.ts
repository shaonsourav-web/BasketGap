import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILT_IN_ADAPTERS, type AdapterRegistry } from '../../adapters/registry.ts';
import type { IngestAdapter, IngestOptions } from '../../adapters/_shared/types.ts';
import { runIngest } from '../ingest.ts';

const EXAMPLE = fileURLToPath(
  new URL('../../../examples/import/specials.example.json', import.meta.url),
);

function registry(extra: IngestAdapter[] = [], errors: string[] = []): AdapterRegistry {
  const adapters = new Map(
    BUILT_IN_ADAPTERS.map((adapter) => [adapter.name, { adapter, origin: 'built-in' }]),
  );
  for (const adapter of extra) adapters.set(adapter.name, { adapter, origin: '/plugins/x.ts' });
  return {
    adapters,
    plugins: extra.length > 0 || errors.length > 0 ? ['/plugins/x.ts'] : [],
    errors,
  };
}

let stdout = '';
let stderr = '';

beforeEach(() => {
  stdout = '';
  stderr = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workers ingest', () => {
  it('explains how to get retailer adapters when none is installed', async () => {
    const code = await runIngest(['coles-pdf', '--fixture', 'x.pdf'], async () => registry());
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown adapter: coles-pdf');
    expect(stderr).toContain(
      'No ingest plugins are installed (BASKETGAP_INGEST_PLUGINS is not set)',
    );
    expect(stderr).toContain('Retailer-specific adapters are not part of this repository');
    expect(stderr.match(/No ingest plugins are installed/g)).toHaveLength(1);
    expect(stderr).toContain('BASKETGAP_INGEST_PLUGINS');
    expect(stderr).toContain('docs/ingest-adapters.md');
    expect(stderr).toMatch(/^ {2}import {3}/m);
  });

  it('lists the built-in adapter in --help', async () => {
    const code = await runIngest(['--help'], async () => registry());
    expect(code).toBe(0);
    expect(stdout).toMatch(/import\s+Import specials from a JSON or CSV file/);
    expect(stdout).toContain('--file <path>');
  });

  it('runs the import adapter on a dry run and prints the JSON summary', async () => {
    const code = await runIngest(['import', '--file', EXAMPLE, '--dry-run'], async () =>
      registry(),
    );
    expect(code).toBe(0);
    const summary = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(summary).toMatchObject({
      ok: true,
      adapter: 'import',
      catalogueId: null,
      skipped: true,
      reason: 'dry-run: no DB writes',
      itemCount: 5,
      warnings: 0,
    });
  });

  it('dispatches to a plugin adapter and labels it in --help', async () => {
    let received: IngestOptions | null = null;
    const plugin: IngestAdapter = {
      name: 'from-plugin',
      description: 'Plugin adapter.',
      ingest: async (options) => {
        received = options;
        throw new Error('plugin ran');
      },
    };
    const code = await runIngest(
      ['from-plugin', '--source-url', 'https://example.test/x'],
      async () => registry([plugin]),
    );
    expect(code).toBe(1);
    expect(received).toEqual({
      sourceUrl: 'https://example.test/x',
      dryRun: false,
      forceRefresh: false,
    });
    expect(stderr).toContain('"error":"plugin ran"');

    stdout = '';
    await runIngest(['--help'], async () => registry([plugin]));
    expect(stdout).toContain('from-plugin');
    expect(stdout).toContain('[plugin: /plugins/x.ts]');
    expect(stdout).not.toContain('Retailer-specific adapters are not part of this repository');
  });

  it('surfaces plugin load errors', async () => {
    const code = await runIngest(['coles-pdf', '--fixture', 'x.pdf'], async () =>
      registry([], ['plugin "/plugins/x.ts" could not be loaded: boom']),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('ingest: plugin "/plugins/x.ts" could not be loaded: boom');
    expect(stderr).toContain('A configured plugin failed to load');
  });

  it('rejects ambiguous or missing sources before calling the adapter', async () => {
    expect(await runIngest(['import'], async () => registry())).toBe(1);
    expect(stderr).toContain('Pass either --source-url or --file.');
    expect(
      await runIngest(['import', '--file', 'a.json', '--source-url', 'https://x'], async () =>
        registry(),
      ),
    ).toBe(1);
    expect(stderr).toContain('not both');
  });
});
