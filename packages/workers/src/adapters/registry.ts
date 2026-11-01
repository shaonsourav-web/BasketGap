import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { IngestAdapter } from './_shared/types.ts';
import { importAdapter } from './import/index.ts';

/**
 * Comma-separated list of plugin modules that contribute ingest adapters.
 * Each entry is a file path (absolute, or relative to the working directory)
 * or a package name resolvable from `@basketgap/workers`. Unset means only the
 * built-in adapters are available — retailer-specific adapters are not part
 * of this repository (docs/decisions.md, 2026-11-01).
 */
export const PLUGIN_ENV = 'BASKETGAP_INGEST_PLUGINS';

export const BUILT_IN_ADAPTERS: readonly IngestAdapter[] = [importAdapter];

export type RegisteredAdapter = {
  adapter: IngestAdapter;
  /** `built-in`, or the plugin entry it came from. */
  origin: string;
};

export type AdapterRegistry = {
  adapters: Map<string, RegisteredAdapter>;
  /** Plugin entries as configured, in order. Empty when the env var is unset. */
  plugins: string[];
  /** One message per plugin (or plugin adapter) that could not be registered. */
  errors: string[];
};

export type ModuleImporter = (specifier: string) => Promise<unknown>;

const ADAPTER_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function parsePluginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Paths become file URLs (so Windows drive letters import correctly); package names pass through. */
export function toImportSpecifier(entry: string, cwd: string): string {
  if (entry.startsWith('.') || isAbsolute(entry)) {
    return pathToFileURL(resolve(cwd, entry)).href;
  }
  return entry;
}

export async function loadAdapterRegistry(
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    importer?: ModuleImporter;
  } = {},
): Promise<AdapterRegistry> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const importer: ModuleImporter = options.importer ?? ((specifier) => import(specifier));

  const adapters = new Map<string, RegisteredAdapter>();
  for (const adapter of BUILT_IN_ADAPTERS)
    adapters.set(adapter.name, { adapter, origin: 'built-in' });

  const plugins = parsePluginList(env[PLUGIN_ENV]);
  const errors: string[] = [];

  for (const entry of plugins) {
    let mod: unknown;
    try {
      mod = await importer(toImportSpecifier(entry, cwd));
    } catch (err) {
      errors.push(
        `plugin "${entry}" could not be loaded: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const candidates = pluginAdapters(mod);
    if (!candidates) {
      errors.push(
        `plugin "${entry}" does not export an \`adapters\` array (named or on the default export)`,
      );
      continue;
    }

    for (const [index, candidate] of candidates.entries()) {
      const problem = validateAdapter(candidate);
      if (problem) {
        errors.push(`plugin "${entry}" adapters[${index}]: ${problem}`);
        continue;
      }
      const adapter = candidate as IngestAdapter;
      const existing = adapters.get(adapter.name);
      if (existing) {
        errors.push(
          `plugin "${entry}" adapter "${adapter.name}" ignored: name already provided by ${existing.origin}`,
        );
        continue;
      }
      adapters.set(adapter.name, { adapter, origin: entry });
    }
  }

  return { adapters, plugins, errors };
}

function pluginAdapters(mod: unknown): unknown[] | null {
  if (!isObject(mod)) return null;
  if (Array.isArray(mod.adapters)) return mod.adapters;
  if (isObject(mod.default) && Array.isArray(mod.default.adapters)) return mod.default.adapters;
  return null;
}

function validateAdapter(candidate: unknown): string | null {
  if (!isObject(candidate)) return 'not an object';
  if (typeof candidate.name !== 'string' || !ADAPTER_NAME.test(candidate.name)) {
    return '`name` must be lowercase letters, digits and dashes';
  }
  if (typeof candidate.description !== 'string') return '`description` must be a string';
  if (typeof candidate.ingest !== 'function') return '`ingest` must be a function';
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
