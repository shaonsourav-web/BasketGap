import { ingestColesPdf } from '../adapters/coles-pdf/index.ts';
import { captureException } from '../lib/observability.ts';

const USAGE = `Usage: workers ingest <adapter> [options]

Adapters:
  coles-pdf    Ingest a Coles weekly PDF catalogue.

Options (coles-pdf):
  --source-url <url>     Fetch PDF from URL.
  --fixture <path>       Load PDF from local fixture file.
  --dry-run              Parse only; skip database writes.
  --force-refresh        Replace existing specials if hash already ingested.

Exactly one of --source-url or --fixture is required.
`;

export async function runIngest(argv: string[]): Promise<number> {
  const [adapter, ...rest] = argv;
  if (!adapter || adapter === '-h' || adapter === '--help') {
    process.stdout.write(USAGE);
    return adapter ? 0 : 1;
  }
  if (adapter !== 'coles-pdf') {
    process.stderr.write(`Unknown adapter: ${adapter}\n${USAGE}`);
    return 1;
  }

  const options = parseFlags(rest);
  if (!options) {
    process.stderr.write(USAGE);
    return 1;
  }

  try {
    const result = await ingestColesPdf(options);
    const summary = {
      ok: true,
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
