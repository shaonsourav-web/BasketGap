import { matchBasket } from '@basketgap/shared/matching/pipeline';
import type { MatchResult } from '@basketgap/shared/matching/types';
import type { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiVariables } from '../middleware/types.ts';

vi.mock('@basketgap/shared/matching/pipeline', () => ({
  matchBasket: vi.fn(),
}));

vi.mock('../lib/infra.ts', () => ({
  getMatchingContext: vi.fn(() => ({})),
  getDb: vi.fn(() => ({})),
  getApiEnv: vi.fn(() => ({
    DATABASE_URL: 'fake',
    MAX_LLM_CALLS_PER_REQUEST: 10,
  })),
  getRateLimiter: vi.fn(() => null),
  resetInfraForTests: vi.fn(),
}));

const mockedMatchBasket = vi.mocked(matchBasket);

let app: Hono<{ Variables: ApiVariables }>;

beforeAll(async () => {
  ({ app } = await import('../app.ts'));
});

beforeEach(() => {
  mockedMatchBasket.mockReset();
});

function fakeResult(over: Partial<MatchResult> = {}): MatchResult {
  return {
    raw: 'milk 2L',
    cleaned: 'milk 2l',
    cleanedInputHash: 'h',
    band: 'matched',
    decidedBy: 'rank',
    canonicalProductId: 'cid',
    top: null,
    alternatives: [],
    audit: [{ step: 'total', durationMs: 5, notes: '' }],
    ...over,
  };
}

describe('GET /api/health', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/match — happy path', () => {
  it('returns results + stats with request_id and latency_ms', async () => {
    mockedMatchBasket.mockResolvedValueOnce([fakeResult()]);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk 2L'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: MatchResult[];
      stats: { cached: number; llm_calls: number; latency_ms: number; request_id: string };
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.band).toBe('matched');
    expect(body.stats.cached).toBe(0);
    expect(body.stats.llm_calls).toBe(0);
    expect(typeof body.stats.latency_ms).toBe('number');
    expect(body.stats.request_id.length).toBeGreaterThan(10);
  });

  it('counts cache hits and llm calls in stats', async () => {
    mockedMatchBasket.mockResolvedValueOnce([
      fakeResult({ decidedBy: 'cache' }),
      fakeResult({
        decidedBy: 'llm',
        audit: [
          { step: 'llm-fallback', durationMs: 200, notes: '' },
          { step: 'total', durationMs: 230, notes: '' },
        ],
      }),
    ]);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk', 'eggs'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stats: { cached: number; llm_calls: number };
    };
    expect(body.stats.cached).toBe(1);
    expect(body.stats.llm_calls).toBe(1);
  });
});

describe('POST /api/match — validation', () => {
  it('rejects empty lines array', async () => {
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('rejects a line longer than 200 chars', async () => {
    const longLine = 'x'.repeat(201);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [longLine] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('rejects more than 100 lines', async () => {
    const lines = Array.from({ length: 101 }, (_, i) => `item ${i}`);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('rejects invalid postcode', async () => {
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'], postcode: 'abcd' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_BODY');
  });

  it('accepts a valid 4-digit postcode', async () => {
    mockedMatchBasket.mockResolvedValueOnce([fakeResult()]);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'], postcode: '2000' }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects malformed JSON body', async () => {
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects body over 32 KB with INPUT_TOO_LARGE', async () => {
    const padding = 'a'.repeat(33 * 1024);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(padding.length + 50),
      },
      body: JSON.stringify({ lines: ['milk'], pad: padding }),
    });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INPUT_TOO_LARGE');
  });
});

describe('POST /api/match — error handling', () => {
  it('returns 500 with INTERNAL code and no leak of upstream error text', async () => {
    mockedMatchBasket.mockRejectedValueOnce(
      new Error('database connection refused at host 10.0.0.5:6543'),
    );
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'] }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Internal Server Error');
    const asString = JSON.stringify(body);
    expect(asString).not.toContain('database connection');
    expect(asString).not.toContain('6543');
    expect(asString).not.toContain('10.0.0.5');
  });
});
