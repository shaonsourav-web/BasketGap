import { ingestColesPdf } from '../adapters/coles-pdf/index.ts';
import { ingestColesWeb } from '../adapters/coles-web/index.ts';
import { ingestWooliesPdf } from '../adapters/woolies-pdf/index.ts';
import type { IngestOptions, IngestResult } from '../adapters/_shared/types.ts';
import { captureException } from '../lib/observability.ts';

const USAGE = `Usage: workers ingest <adapter> [options]

Adapters:
  coles-pdf      Ingest a Coles weekly PDF catalogue.
  woolies-pdf    Ingest a Woolworths weekly PDF catalogue.
  coles-web      Ingest the Coles "Down Down" web specials page.

Options:
  --source-url <url>     Fetch source from URL (PDF: HTTP, web: headless browser).
  --fixture <path>       Load source from local fixture file.
  --dry-run              Parse only; skip database writes.
  --force-refresh        Replace existing specials if hash already ingested.

Exactly one of --source-url or --fixture is required.
`;

const ADAPTERS: Record<string, (options: IngestOptions) => Promise<IngestResult>> = {
  'coles-pdf': ingestColesPdf,
  'woolies-pdf': ingestWooliesPdf,
  'coles-web': ingestColesWeb,
};

export async function runIngest(argv: string[]): Promise<number> {
  const [adapter, ...rest] = argv;
  if (!adapter || adapter === '-h' || adapter === '--help') {
    process.stdout.write(USAGE);
    return adapter ? 0 : 1;
  }
  const ingester = ADAPTERS[adapter];
  if (!ingester) {
    process.stderr.write(`Unknown adapter: ${adapter}\n${USAGE}`);
    return 1;
  }

  const options = parseFlags(rest);
  if (!options) {
    process.stderr.write(USAGE);
    return 1;
  }

  try {
    const result = await ingester(options);
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

function parseFlags(
  argv: string[],
): { sourceUrl?: string; fixturePath?: string; dryRun: boolean; forceRefresh: boolean } | null {
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
    process.stderr.write('Pass --source-url or --fixture, not both.\n');
    return null;
  }
  if (!sourceUrl && !fixturePath) {
    process.stderr.write('Pass either --source-url or --fixture.\n');
    return null;
  }

  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(fixturePath ? { fixturePath } : {}),
    dryRun,
    forceRefresh,
  };
}
