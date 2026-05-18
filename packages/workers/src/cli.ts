import { runIngest } from './commands/ingest.ts';
import { runPing } from './commands/ping.ts';
import { initObservability } from './lib/observability.ts';

const USAGE = `Usage: workers <command>

Commands:
  ping              Connect to the database, print env + connectivity info, exit.
  ingest <adapter>  Run a retailer ingestion adapter (e.g. coles-pdf).
`;

async function main(argv: string[]): Promise<number> {
  initObservability();
  const [command, ...rest] = argv;
  switch (command) {
    case 'ping':
      return runPing();
    case 'ingest':
      return runIngest(rest);
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
