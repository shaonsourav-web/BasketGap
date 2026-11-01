import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { IngestAdapter } from '../_shared/types.ts';
import {
  PLUGIN_ENV,
  loadAdapterRegistry,
  parsePluginList,
  toImportSpecifier,
  type ModuleImporter,
} from '../registry.ts';

const FIXTURE_PLUGIN = fileURLToPath(new URL('./fixtures/example-plugin.ts', import.meta.url));

function adapter(name: string): IngestAdapter {
  return {
    name,
    description: `${name} adapter`,
    ingest: async () => {
      throw new Error('not called');
    },
  };
}

function fakeImporter(modules: Record<string, unknown>): ModuleImporter {
  return async (specifier) => {
    if (!(specifier in modules)) throw new Error(`Cannot find module '${specifier}'`);
    return modules[specifier];
  };
}

describe('loadAdapterRegistry', () => {
  it('offers only the built-in import adapter when no plugin is configured', async () => {
    const registry = await loadAdapterRegistry({
      env: {},
      importer: async () => {
        throw new Error('must not import anything');
      },
    });
    expect([...registry.adapters.keys()]).toEqual(['import']);
    expect(registry.adapters.get('import')!.origin).toBe('built-in');
    expect(registry.plugins).toEqual([]);
    expect(registry.errors).toEqual([]);
  });

  it('treats an empty or whitespace-only variable as unset', async () => {
    const registry = await loadAdapterRegistry({ env: { [PLUGIN_ENV]: ' , ' } });
    expect(registry.plugins).toEqual([]);
    expect([...registry.adapters.keys()]).toEqual(['import']);
  });

  it('loads a real plugin file by absolute path', async () => {
    const registry = await loadAdapterRegistry({ env: { [PLUGIN_ENV]: FIXTURE_PLUGIN } });
    expect(registry.errors).toEqual([]);
    expect(registry.adapters.get('example-plugin')?.origin).toBe(FIXTURE_PLUGIN);
  });

  it('accepts named and default `adapters` exports from several plugins', async () => {
    const registry = await loadAdapterRegistry({
      env: { [PLUGIN_ENV]: 'named-plugin, default-plugin' },
      importer: fakeImporter({
        'named-plugin': { adapters: [adapter('alpha')] },
        'default-plugin': { default: { adapters: [adapter('beta'), adapter('gamma')] } },
      }),
    });
    expect(registry.errors).toEqual([]);
    expect([...registry.adapters.keys()]).toEqual(['import', 'alpha', 'beta', 'gamma']);
    expect(registry.adapters.get('beta')!.origin).toBe('default-plugin');
  });

  it('reports broken plugins and invalid adapters without dropping the good ones', async () => {
    const registry = await loadAdapterRegistry({
      env: { [PLUGIN_ENV]: 'missing,no-export,mixed' },
      importer: fakeImporter({
        'no-export': { something: 1 },
        mixed: {
          adapters: [
            adapter('good'),
            adapter('import'),
            adapter('good'),
            adapter('Bad Name'),
            { name: 'no-ingest', description: 'x' },
            null,
          ],
        },
      }),
    });
    expect([...registry.adapters.keys()]).toEqual(['import', 'good']);
    expect(registry.adapters.get('import')!.origin).toBe('built-in');
    expect(registry.errors).toEqual([
      `plugin "missing" could not be loaded: Cannot find module 'missing'`,
      'plugin "no-export" does not export an `adapters` array (named or on the default export)',
      'plugin "mixed" adapter "import" ignored: name already provided by built-in',
      'plugin "mixed" adapter "good" ignored: name already provided by mixed',
      'plugin "mixed" adapters[3]: `name` must be lowercase letters, digits and dashes',
      'plugin "mixed" adapters[4]: `ingest` must be a function',
      'plugin "mixed" adapters[5]: not an object',
    ]);
  });
});

describe('plugin entry parsing', () => {
  it('splits on commas and trims', () => {
    expect(parsePluginList(undefined)).toEqual([]);
    expect(parsePluginList(' a ,, b,')).toEqual(['a', 'b']);
  });

  it('turns paths into file URLs relative to the working directory, leaving package names alone', () => {
    expect(toImportSpecifier('/opt/plugin/index.ts', '/work')).toBe(
      pathToFileURL('/opt/plugin/index.ts').href,
    );
    expect(toImportSpecifier('../private/src/index.ts', '/work/repo')).toBe(
      pathToFileURL('/work/private/src/index.ts').href,
    );
    expect(toImportSpecifier('@scope/ingest-plugin', '/work')).toBe('@scope/ingest-plugin');
  });
});
