import { describe, expect, it, vi } from 'vitest';

import { matchBasket, matchLine } from '../pipeline.ts';
import type { CachedMatch, MatchResult, PipelineContext, RawCandidateRow } from '../types.ts';

function buildCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const cacheStore: Map<string, CachedMatch> = new Map();
  return {
    hasOpenAi: false,
    hasOpenRouter: false,
    openRouterModel: 'mock',
    embedText: vi.fn(async () => new Array(1536).fill(0)),
    llmChoose: vi.fn(async () => ({ chosenId: null, confidence: 0, reasoning: '' })),
    loadCandidatesByName: vi.fn<(c: string, b: string | null) => Promise<RawCandidateRow[]>>(
      async () => [],
    ),
    loadCandidatesByVector: vi.fn<(e: number[]) => Promise<RawCandidateRow[]>>(async () => []),
    readCache: vi.fn(async (h: string) => cacheStore.get(h) ?? null),
    writeCache: vi.fn(async (h: string, _c: string, r: MatchResult) => {
      cacheStore.set(h, {
        canonicalProductId: r.canonicalProductId,
        confidenceBand: r.band,
        alternatives: r.alternatives,
        decidedBy: r.decidedBy === 'cache' ? 'rank' : r.decidedBy,
      });
    }),
    ...overrides,
  };
}

describe('matchLine pipeline', () => {
  it('returns matched band when direct lookup finds a high-confidence row', async () => {
    const ctx = buildCtx({
      loadCandidatesByName: vi.fn(async () => [
        {
          id: 'milk-2l',
          name: 'Full Cream Milk',
          brand: null,
          category: 'dairy',
          unitSizeValue: 2,
          unitSizeUom: 'L',
          textSimilarity: 1.0,
        },
      ]),
    });
    const result = await matchLine('Full Cream Milk 2L', ctx);
    expect(result.canonicalProductId).toBe('milk-2l');
    expect(result.band).toBe('matched');
    expect(result.decidedBy).toBe('direct');
  });

  it('returns assumed band when only a partial match exists', async () => {
    const ctx = buildCtx({
      loadCandidatesByName: vi.fn(async () => [
        {
          id: 'milk',
          name: 'Milk',
          brand: null,
          category: 'dairy',
          unitSizeValue: null,
          unitSizeUom: null,
          textSimilarity: 0.7,
        },
      ]),
    });
    const result = await matchLine('milky drink stuff', ctx);
    expect(result.band).toBe('assumed');
  });

  it('returns needs_attention when no candidates found', async () => {
    const ctx = buildCtx();
    const result = await matchLine('xqzy zzgh blah', ctx);
    expect(result.band).toBe('needs_attention');
    expect(result.canonicalProductId).toBeNull();
  });

  it('cache hit short-circuits the pipeline on repeat input', async () => {
    const ctx = buildCtx({
      loadCandidatesByName: vi.fn(async () => [
        {
          id: 'milk-2l',
          name: 'Full Cream Milk',
          brand: null,
          category: 'dairy',
          unitSizeValue: 2,
          unitSizeUom: 'L',
          textSimilarity: 1.0,
        },
      ]),
    });
    const first = await matchLine('milk 2L', ctx);
    const second = await matchLine('milk 2L', ctx);
    expect(first.decidedBy).toBe('direct');
    expect(second.decidedBy).toBe('cache');
  });

  it('shorthand expands "snags" → "sausages" before lookup', async () => {
    const loadByName = vi.fn(async (cleaned: string) => {
      if (cleaned.includes('sausages')) {
        return [
          {
            id: 'snags-id',
            name: 'BBQ Sausages',
            brand: null,
            category: 'meat',
            unitSizeValue: 500,
            unitSizeUom: 'g',
            textSimilarity: 0.95,
          },
        ];
      }
      return [];
    });
    const ctx = buildCtx({ loadCandidatesByName: loadByName });
    const result = await matchLine('snags', ctx);
    expect(result.canonicalProductId).toBe('snags-id');
    expect(result.band).not.toBe('needs_attention');
  });

  it('LLM fallback fires when top score is below assumed threshold', async () => {
    const ctx = buildCtx({
      hasOpenRouter: true,
      loadCandidatesByName: vi.fn(async () => [
        {
          id: 'cand-a',
          name: 'Cheese Sticks',
          brand: null,
          category: 'dairy',
          unitSizeValue: null,
          unitSizeUom: null,
          textSimilarity: 0.4,
        },
      ]),
      llmChoose: vi.fn(async () => ({
        chosenId: 'cand-a',
        confidence: 0.7,
        reasoning: 'best fit',
      })),
    });
    const result = await matchLine('mystery dairy stick', ctx);
    expect(result.decidedBy).toBe('llm');
    expect(result.canonicalProductId).toBe('cand-a');
  });

  it('matchBasket skips blank lines', async () => {
    const ctx = buildCtx();
    const out = await matchBasket(['', '   ', 'something'], ctx);
    expect(out).toHaveLength(1);
  });

  it('records an audit trail with every step', async () => {
    const ctx = buildCtx();
    const result = await matchLine('milk', ctx);
    const steps = result.audit.map((a) => a.step);
    expect(steps).toContain('clean');
    expect(steps).toContain('rank');
    expect(steps).toContain('total');
  });
});
