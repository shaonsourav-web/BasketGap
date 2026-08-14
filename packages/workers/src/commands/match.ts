import { readFile } from 'node:fs/promises';

import { createDb, createSqlClient } from '@basketgap/shared/db/client';
import { loadEnv } from '@basketgap/shared/lib/env';
import { createDbContext } from '@basketgap/shared/matching/db';
import { matchBasket, matchLine } from '@basketgap/shared/matching/pipeline';

interface MatchArgs {
  line: string | null;
  listPath: string | null;
}

function parseArgs(argv: string[]): MatchArgs {
  let line: string | null = null;
  let listPath: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--line') {
      line = argv[++i] ?? null;
    } else if (a === '--list') {
      listPath = argv[++i] ?? null;
    }
  }
  return { line, listPath };
}

export async function runMatch(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.line && !args.listPath) {
    process.stderr.write('Usage: workers match --line "<text>" | --list <file>|-\n');
    return 1;
  }
  const env = loadEnv();
  const sql = createSqlClient(env.DATABASE_URL);
  const db = createDb(sql);
  try {
    const ctx = createDbContext({
      db,
      openAiKey: env.OPENAI_API_KEY,
      openRouterKey: env.OPENROUTER_API_KEY,
      openRouterModel: env.OPENROUTER_MODEL,
    });
    if (args.line) {
      const result = await matchLine(args.line, ctx);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    const lines = await readLines(args.listPath!);
    const results = await matchBasket(lines, ctx);
    process.stdout.write(`${JSON.stringify(results)}\n`);
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readLines(path: string): Promise<string[]> {
  const text = path === '-' ? await readStdin() : await readFile(path, 'utf-8');
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
