import { PLUGIN_ENV, loadAdapterRegistry, type AdapterRegistry } from '../adapters/registry.ts';
import type { IngestOptions } from '../adapters/_shared/types.ts';
import { captureException } from '@basketgap/shared/lib/observability';

const OPTIONS_USAGE = `Options:
  --file <path>          Load the source from a local file (alias: --fixture).
  --source-url <url>     Fetch the source from a URL (only adapters that support it).
  --dry-run              Parse only; skip database writes.
  --force-refresh        Replace existing specials if hash already ingested.

Exactly one of --source-url or --file is required.
`;

const NO_PLUGINS = `No ingest plugins are installed (${PLUGIN_ENV} is not set).
Retailer-specific adapters are not part of this repository; a plugin that
provides them is loaded from ${PLUGIN_ENV} (comma-separated module paths
or package names). Without one, the built-in \`import\` adapter loads specials
from a JSON or CSV file — see docs/ingest-adapters.md.
`;

export async function runIngest(
  argv: string[],
  loadRegistry: () => Promise<AdapterRegistry> = () => loadAdapterRegistry(),
): Promise<number> {
  const registry = await loadRegistry();
  for (const error of registry.errors) process.stderr.write(`ingest: ${error}\n`);

  const [adapter, ...rest] = argv;
  if (!adapter || adapter === '-h' || adapter === '--help') {
    process.stdout.write(usage(registry));
    return adapter ? 0 : 1;
  }
  const registered = registry.adapters.get(adapter);
  if (!registered) {
    process.stderr.write(`Unknown adapter: ${adapter}\n`);
    if (registry.plugins.length === 0) {
      process.stderr.write(`\n${NO_PLUGINS}`);
    } else if (registry.errors.length > 0) {
      process.stderr.write('\nA configured plugin failed to load (see above).\n');
    }
    process.stderr.write(`\n${usage(registry, { pluginNote: false })}`);
    return 1;
  }

  const options = parseFlags(rest);
  if (!options) {
    process.stderr.write(usage(registry));
    return 1;
  }

  try {
    const result = await registered.adapter.ingest(options);
    const summary = {
      ok: true,
      adapter,
      catalogueId: result.catalogueId,
      skipped: result.skipped,
      reason: result.reason,
      specialsInserted: result.specialsInserted,
      itemCount: result.parsed.itemCount,
      pageCount: result.parsed.pageCount,
      warnings: result.parsed.warnings.length,
    };
    process.stdout.write(JSON.stringify(summary) + '\n');
    return 0;
  } catch (err) {
    captureException(err, { adapter });
    process.stderr.write(
      JSON.stringify({
        ok: false,
        adapter,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
    return 1;
  }
}

function usage(
  registry: AdapterRegistry,
  options: { pluginNote: boolean } = { pluginNote: true },
): string {
  const entries = [...registry.adapters.values()];
  const width = Math.max(...entries.map(({ adapter }) => adapter.name.length)) + 2;
  const lines = entries.map(({ adapter, origin }) => {
    const from = origin === 'built-in' ? '' : ` [plugin: ${origin}]`;
    return `  ${adapter.name.padEnd(width)} ${adapter.description}${from}`;
  });
  const pluginNote = options.pluginNote && registry.plugins.length === 0 ? `\n${NO_PLUGINS}` : '';
  return `Usage: workers ingest <adapter> [options]

Adapters:
${lines.join('\n')}
${pluginNote}
${OPTIONS_USAGE}`;
}

function parseFlags(argv: string[]): IngestOptions | null {
  let sourceUrl: string | undefined;
  let fixturePath: string | undefined;
  let dryRun = false;
  let forceRefresh = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case '--source-url':
        sourceUrl = argv[++i];
        break;
      case '--file':
      case '--fixture':
        fixturePath = argv[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force-refresh':
        forceRefresh = true;
        break;
      default:
        process.stderr.write(`Unknown flag: ${arg}\n`);
        return null;
    }
  }

  if (sourceUrl && fixturePath) {
    process.stderr.write('Pass --source-url or --file, not both.\n');
    return null;
  }
  if (!sourceUrl && !fixturePath) {
    process.stderr.write('Pass either --source-url or --file.\n');
    return null;
  }

  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(fixturePath ? { fixturePath } : {}),
    dryRun,
    forceRefresh,
  };
}
