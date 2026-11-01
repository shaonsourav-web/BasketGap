import { runEnrichSkus } from './commands/enrich-skus.ts';
import { runIngest } from './commands/ingest.ts';
import { runMatch } from './commands/match.ts';
import { runPing } from './commands/ping.ts';
import { runPruneCache } from './commands/prune-cache.ts';
import { runSeedCanonical } from './commands/seed-canonical.ts';
import { initObservability } from '@basketgap/shared/lib/observability';

const USAGE = `Usage: workers <command>

Commands:
  ping                       Connect to the database, print env + connectivity info, exit.
  ingest <adapter>           Run an ingest adapter: built-in \`import\` (JSON/CSV file) or one from a plugin (BASKETGAP_INGEST_PLUGINS).
  seed canonical             Embed + upsert the canonical product seed (requires GEMINI_API_KEY; supports --dry-run, --force-refresh).
  match --line "<text>"      Match a single shopping-list line via the deterministic-first pipeline.
  match --list <file>|-      Match every newline-separated line from a file or stdin.
  prune-cache                Bound match_cache growth (supports --max-age-days, --max-rows).
  enrich-skus                Map existing specials.retailer_sku → canonical_products.id (supports --retailer, --limit, --dry-run).
`;

async function main(argv: string[]): Promise<number> {
  initObservability();
  const [command, ...rest] = argv;
  switch (command) {
    case 'ping':
      return runPing();
    case 'ingest':
      return runIngest(rest);
    case 'seed': {
      const [target, ...seedArgs] = rest;
      if (target === 'canonical') return runSeedCanonical(seedArgs);
      process.stderr.write(`Unknown seed target: ${target ?? '(none)'}\n${USAGE}`);
      return 1;
    }
    case 'match':
      return runMatch(rest);
    case 'prune-cache':
      return runPruneCache(rest);
    case 'enrich-skus':
      return runEnrichSkus(rest);
    case undefined:
    case '-h':
    case '--help':
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n${USAGE}`);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
