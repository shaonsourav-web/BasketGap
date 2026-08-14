/**
 * Local dev playground for the matching engine.
 *
 * Runs a tiny HTTP server (no deps beyond node:http) that serves a single
 * HTML page and a `/match` endpoint. Every line typed in the textarea is run
 * through the real pipeline (`matchLine`) against the offline in-memory
 * catalogue used by the eval harness — no database, no API keys, no network.
 *
 * Run with: pnpm --filter @basketgap/shared playground
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { matchLine } from '../src/matching/pipeline.ts';
import { createOfflineContext } from '../src/matching/__tests__/eval/offline-catalogue.ts';

const PORT = 8787;
const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, 'playground.html');

interface CandidateView {
  name: string;
  brand: string | null;
  score: number;
}

interface LineResult {
  input: string;
  picked: string | null;
  band: string;
  decidedBy: string;
  score: number;
  candidates: CandidateView[];
}

async function matchLines(lines: string[]): Promise<LineResult[]> {
  const ctx = createOfflineContext();
  const results: LineResult[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const result = await matchLine(line, ctx);
    results.push({
      input: line,
      picked: result.band === 'needs_attention' ? null : (result.top?.name ?? null),
      band: result.band,
      decidedBy: result.decidedBy,
      score: Math.round((result.top?.finalScore ?? 0) * 1000) / 1000,
      candidates: result.alternatives.slice(0, 3).map((c) => ({
        name: c.name,
        brand: c.brand,
        score: Math.round(c.finalScore * 1000) / 1000,
      })),
    });
  }
  return results;
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const html = readFileSync(HTML_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/match') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      void (async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
            lines?: unknown;
          };
          const lines = Array.isArray(body.lines)
            ? body.lines.filter((l) => typeof l === 'string')
            : [];
          const results = await matchLines(lines);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ results }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'bad request' }));
        }
      })();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`matching playground → http://localhost:${PORT}`);
});
