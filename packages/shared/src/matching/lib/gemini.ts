/**
 * Embedding adapter — Google Gemini (Generative Language API v1beta).
 * `GEMINI_API_KEY` enables the vector tier only; the LLM disambiguation
 * fallback lives in `./openai.ts` behind its own key, so either tier can be
 * present without the other.
 *
 * Security posture:
 * - The API key is server-side only. It travels in the `x-goog-api-key` header,
 *   never in the URL (URLs land in proxy/CDN logs), and is never logged or
 *   echoed into error messages.
 * - Only the cleaned shopping-list line is sent. No device ids, postcodes, or
 *   raw user baskets.
 */
import { fetchExternal, type ExternalFetchInit } from '../../lib/fetch.ts';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Kept at 1536 so the existing `pgvector(1536)` column needs no migration.
 * Gemini's native embedding width is 3072; we request the truncated 1536
 * output via `outputDimensionality` (see the normalisation note below).
 */
export const EMBEDDING_DIM = 1536;

export interface EmbedOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

function endpoint(model: string, method: 'embedContent'): string {
  return `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:${method}`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    // Header, never a query string: keys in URLs leak into proxy and CDN logs.
    'x-goog-api-key': apiKey,
  };
}

/**
 * L2-normalise a vector in place-safe fashion.
 *
 * CRITICAL: Gemini only returns unit-length embeddings at its NATIVE
 * dimensionality (3072). When `outputDimensionality` truncates the vector —
 * as it does here, to 1536 — the result is NOT normalised. Our pgvector
 * similarity uses cosine distance (`<=>`) and the ranker treats the score as a
 * cosine similarity, so every stored and every query vector MUST be normalised
 * before it leaves this module. Skipping this silently degrades every vector
 * search result rather than failing loudly.
 */
function l2Normalise(vec: number[]): number[] {
  let sumSquares = 0;
  for (const v of vec) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error('Gemini embeddings returned a zero or non-finite vector');
  }
  return vec.map((v) => v / norm);
}

export async function embedText(text: string, options: EmbedOptions): Promise<number[]> {
  if (!options.apiKey) {
    throw new Error('embedText: GEMINI_API_KEY is required');
  }
  const model = options.model ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
  const init: ExternalFetchInit = {
    method: 'POST',
    headers: authHeaders(options.apiKey),
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    }),
  };
  if (options.signal) init.signal = options.signal;
  const response = await fetchExternal(endpoint(model, 'embedContent'), init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini embeddings failed (${response.status}): ${body.slice(0, 240)}`);
  }
  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
  };
  const vec = payload.embedding?.values;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw new Error(`Gemini embeddings returned unexpected shape (len=${vec?.length ?? 'n/a'})`);
  }
  return l2Normalise(vec);
}
