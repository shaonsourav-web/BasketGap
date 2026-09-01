import { matchBasket } from '@basketgap/shared/matching/pipeline';
import type { LlmChooseInput, MatchResult } from '@basketgap/shared/matching/types';
import type { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiVariables } from '../middleware/types.ts';
import type { RateLimiterLike } from '../middleware/rate-limit.ts';

vi.mock('@basketgap/shared/matching/pipeline', () => ({
  matchBasket: vi.fn(),
}));

const mockLimiter: { current: RateLimiterLike | null } = { current: null };

vi.mock('../lib/infra.ts', () => ({
  getMatchingContext: vi.fn(() => ({
    hasOpenAi: false,
    hasOpenRouter: false,
    openRouterModel: '',
    embedText: vi.fn(),
    llmChoose: vi.fn(async () => ({ chosenId: 'cid', confidence: 0.9, reasoning: '' })),
    loadCandidatesByName: vi.fn(),
    loadCandidatesByVector: vi.fn(),
    readCache: vi.fn(),
    writeCache: vi.fn(),
  })),
  getDb: vi.fn(() => ({})),
  getApiEnv: vi.fn(() => ({
    DATABASE_URL: 'fake',
    MAX_LLM_CALLS_PER_REQUEST: 2,
    ALLOWED_ORIGINS: 'https://app.basketgap.test,https://staging.basketgap.test',
  })),
  getRateLimiter: vi.fn(() => mockLimiter.current),
  loadOffers: vi.fn(async () => new Map()),
  resolveState: vi.fn(async () => null),
  resetInfraForTests: vi.fn(),
}));

const mockedMatchBasket = vi.mocked(matchBasket);

let app: Hono<{ Variables: ApiVariables }>;

beforeAll(async () => {
  ({ app } = await import('../app.ts'));
});

beforeEach(() => {
  mockedMatchBasket.mockReset();
  mockLimiter.current = null;
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

describe('request-id middleware', () => {
  it('sets X-Request-Id on success responses', async () => {
    mockedMatchBasket.mockResolvedValueOnce([fakeResult()]);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'] }),
    });
    const headerId = res.headers.get('X-Request-Id');
    expect(headerId).toBeTruthy();
    const body = (await res.json()) as { stats: { request_id: string } };
    expect(body.stats.request_id).toBe(headerId);
  });

  it('sets X-Request-Id on error responses', async () => {
    mockedMatchBasket.mockRejectedValueOnce(new Error('boom'));
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'] }),
    });
    const headerId = res.headers.get('X-Request-Id');
    expect(headerId).toBeTruthy();
    const body = (await res.json()) as { error: { request_id: string } };
    expect(body.error.request_id).toBe(headerId);
  });

  it('echoes a client-supplied X-Request-Id when reasonable', async () => {
    mockedMatchBasket.mockResolvedValueOnce([fakeResult()]);
    const supplied = 'client-trace-12345';
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': supplied },
      body: JSON.stringify({ lines: ['milk'] }),
    });
    expect(res.headers.get('X-Request-Id')).toBe(supplied);
  });
});

describe('CORS middleware', () => {
  it('echoes allowed origin', async () => {
    const res = await app.request('/api/health', {
      method: 'GET',
      headers: { origin: 'https://app.basketgap.test' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.basketgap.test');
  });

  it('does not echo disallowed origin', async () => {
    const res = await app.request('/api/health', {
      method: 'GET',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('rate limit middleware', () => {
  it('returns 429 with retry-after when limit exceeded', async () => {
    mockLimiter.current = {
      async limit() {
        return { success: false, limit: 30, remaining: 0, reset: Date.now() + 30_000 };
      },
    };
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'] }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('passes through when limiter allows', async () => {
    mockLimiter.current = {
      async limit() {
        return { success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 };
      },
    };
    mockedMatchBasket.mockResolvedValueOnce([fakeResult()]);
    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['milk'] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('29');
  });
});

describe('LLM cap', () => {
  it('truncates LLM calls past MAX_LLM_CALLS_PER_REQUEST and marks results', async () => {
    mockedMatchBasket.mockImplementationOnce(async (lines, ctx) => {
      const out: MatchResult[] = [];
      for (const line of lines) {
        const llm = await ctx.llmChoose({} as LlmChooseInput);
        out.push({
          raw: line,
          cleaned: line,
          cleanedInputHash: 'h',
          band: llm.chosenId ? 'matched' : 'needs_attention',
          decidedBy: llm.chosenId ? 'llm' : 'rank',
          canonicalProductId: llm.chosenId,
          top: null,
          alternatives: [],
          audit: [
            { step: 'llm-fallback', durationMs: 5, notes: '' },
            { step: 'total', durationMs: 6, notes: '' },
          ],
        });
      }
      return out;
    });

    const res = await app.request('/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: ['a', 'b', 'c', 'd'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ truncated: boolean; decidedBy: string }>;
      stats: { llm_calls: number; llm_cap_reached: boolean };
    };
    expect(body.stats.llm_cap_reached).toBe(true);
    expect(body.stats.llm_calls).toBe(2);
    expect(body.results[0]?.truncated).toBe(false);
    expect(body.results[1]?.truncated).toBe(false);
    expect(body.results[2]?.truncated).toBe(true);
    expect(body.results[3]?.truncated).toBe(true);
  });
});
