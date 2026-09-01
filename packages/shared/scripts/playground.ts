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

interface DemoOffer {
  retailer: 'coles' | 'woolworths';
  specialPrice: number;
  regularPrice: number;
  promoLabel: string;
}

interface LineResult {
  input: string;
  picked: string | null;
  band: string;
  decidedBy: string;
  score: number;
  candidates: CandidateView[];
  offers: DemoOffer[];
}

/**
 * Deterministic fake offers so the playground can demo the full
 * type → match → both-store price → promo flow with no database.
 * Real offers come from ingested catalogues via @basketgap/shared/pricing.
 */
function demoOffersFor(canonicalProductId: string | null): DemoOffer[] {
  if (!canonicalProductId) return [];
  let h = 0;
  for (const ch of canonicalProductId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const offers: DemoOffer[] = [];
  const regular = 2 + (h % 900) / 100; // $2.00–$10.99
  if (h % 5 < 2) {
    offers.push({
      retailer: 'coles',
      regularPrice: Math.round(regular * 100) / 100,
      specialPrice: Math.round(regular * 50) / 100,
      promoLabel: '1/2 Price',
    });
  }
  if ((h >> 3) % 5 < 2) {
    const woolRegular = regular * 1.05;
    offers.push({
      retailer: 'woolworths',
      regularPrice: Math.round(woolRegular * 100) / 100,
      specialPrice: Math.round(woolRegular * 70) / 100,
      promoLabel: 'Prices Dropped',
    });
  }
  return offers;
}

async function matchLines(lines: string[]): Promise<LineResult[]> {
  const ctx = createOfflineContext();
  const results: LineResult[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const result = await matchLine(line, ctx);
    const accepted = result.band !== 'needs_attention';
    results.push({
      input: line,
      picked: accepted ? (result.top?.name ?? null) : null,
      band: result.band,
      decidedBy: result.decidedBy,
      score: Math.round((result.top?.finalScore ?? 0) * 1000) / 1000,
      candidates: result.alternatives.slice(0, 3).map((c) => ({
        name: c.name,
        brand: c.brand,
        score: Math.round(c.finalScore * 1000) / 1000,
      })),
      offers: accepted ? demoOffersFor(result.canonicalProductId) : [],
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
