import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../db/client.ts';
import { loadEnv } from '../../lib/env.ts';
import { createDbContextFromEnv } from '../db.ts';
import { EMBEDDING_DIM } from '../lib/gemini.ts';
import { matchLine } from '../pipeline.ts';
import type { PipelineContext } from '../types.ts';

import { createOfflineContext } from './eval/offline-catalogue.ts';

/**
 * The two provider tiers are keyed independently: GEMINI_API_KEY → vector
 * search, OPENAI_API_KEY → LLM fallback. Every combination must run without
 * crashing, and a tier whose key is absent must make zero network calls.
 *
 * The context's provider surface (flags, embedText, llmChoose) comes from the
 * real `createDbContextFromEnv`; only the database-backed loaders are swapped
 * for the offline catalogue, so no database is needed.
 */

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const OPENAI_HOST = 'api.openai.com';

// Falls below the `assumed` band on the deterministic path with a non-empty
// shortlist, so the LLM fallback is reached whenever the tier is enabled.
const LLM_LINE = 'bbq snags 500g';

function contextFor(keys: { gemini?: string; openai?: string }): PipelineContext {
  const env = loadEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/postgres',
    ...(keys.gemini ? { GEMINI_API_KEY: keys.gemini } : {}),
    ...(keys.openai ? { OPENAI_API_KEY: keys.openai } : {}),
  });
  const providers = createDbContextFromEnv({} as Db, env);
  const offline = createOfflineContext();
  return {
    ...offline,
    hasEmbeddings: providers.hasEmbeddings,
    hasLlm: providers.hasLlm,
    llmModel: providers.llmModel,
    embedText: providers.embedText,
    llmChoose: providers.llmChoose,
  };
}

/** Routes stubbed fetches by host; the OpenAI stub picks the first shortlist id. */
function stubProviders(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    if (url.includes(GEMINI_HOST)) {
      return Response.json({
        embedding: { values: Array.from({ length: EMBEDDING_DIM }, () => 1) },
      });
    }
    if (url.includes(OPENAI_HOST)) {
      const body = JSON.parse(init?.body ?? '{}') as {
        text: { format: { schema: { properties: { chosenId: { enum?: unknown[] } } } } };
      };
      const first = body.text.format.schema.properties.chosenId.enum?.[0] ?? null;
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify({ chosenId: first, confidence: 0.7 }) },
            ],
          },
        ],
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function hostsCalled(fetchMock: ReturnType<typeof vi.fn>): Set<string> {
  return new Set(fetchMock.mock.calls.map((c) => new URL(String(c[0])).host));
}

describe('provider key matrix', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no keys: trigram-only, rank-only, zero network calls, deterministic', async () => {
    const fetchMock = stubProviders();
    const ctx = contextFor({});

    expect(ctx.hasEmbeddings).toBe(false);
    expect(ctx.hasLlm).toBe(false);
    const a = await matchLine(LLM_LINE, ctx);
    const b = await matchLine(LLM_LINE, ctx);
    const milk = await matchLine('2L full cream milk', ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(a.decidedBy).not.toBe('llm');
    expect(a.band).toBe('needs_attention');
    expect({ ...a, audit: [] }).toEqual({ ...b, audit: [] });
    expect(milk.band).toBe('matched');
    expect(milk.canonicalProductId).not.toBeNull();
  });

  it('GEMINI_API_KEY only: embeddings run, the LLM fallback never fires', async () => {
    const fetchMock = stubProviders();
    const ctx = contextFor({ gemini: 'g-test' });

    expect(ctx.hasEmbeddings).toBe(true);
    expect(ctx.hasLlm).toBe(false);
    const result = await matchLine(LLM_LINE, ctx);

    expect(hostsCalled(fetchMock)).toEqual(new Set([GEMINI_HOST]));
    expect(result.decidedBy).not.toBe('llm');
  });

  it('OPENAI_API_KEY only: no embedding call, the LLM fallback decides', async () => {
    const fetchMock = stubProviders();
    const ctx = contextFor({ openai: 'o-test' });

    expect(ctx.hasEmbeddings).toBe(false);
    expect(ctx.hasLlm).toBe(true);
    expect(ctx.llmModel).toBe('gpt-6-luna');
    const result = await matchLine(LLM_LINE, ctx);

    expect(hostsCalled(fetchMock)).toEqual(new Set([OPENAI_HOST]));
    expect(result.decidedBy).toBe('llm');
    expect(result.canonicalProductId).not.toBeNull();
  });

  it('both keys: embeddings and LLM fallback both run', async () => {
    const fetchMock = stubProviders();
    const ctx = contextFor({ gemini: 'g-test', openai: 'o-test' });

    const result = await matchLine(LLM_LINE, ctx);

    expect(hostsCalled(fetchMock)).toEqual(new Set([GEMINI_HOST, OPENAI_HOST]));
    expect(result.decidedBy).toBe('llm');
  });

  it('keyless llmChoose declines instead of throwing; keyless embedText throws', async () => {
    const ctx = createDbContextFromEnv(
      {} as Db,
      loadEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/postgres' }),
    );

    await expect(ctx.llmChoose({ cleaned: 'milk', shortlist: [] })).resolves.toEqual({
      chosenId: null,
      confidence: 0,
      reasoning: 'OPENAI_API_KEY missing',
    });
    await expect(ctx.embedText('milk')).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
