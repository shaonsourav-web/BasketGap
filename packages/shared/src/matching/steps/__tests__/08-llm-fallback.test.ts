import { describe, expect, it, vi } from 'vitest';

import { llmFallback } from '../08-llm-fallback.ts';
import type { MatchCandidate, PipelineContext } from '../../types.ts';

function candidate(id: string, score = 0.4): MatchCandidate {
  return {
    canonicalProductId: id,
    name: id,
    brand: null,
    category: null,
    unitSizeValue: null,
    unitSizeUom: null,
    textSimilarity: 0,
    vectorSimilarity: 0,
    sizeMatch: 0,
    brandMatch: 0,
    popularityPrior: 0,
    finalScore: score,
  };
}

function ctxWith(llmChoose: PipelineContext['llmChoose'], hasOpenRouter = true): PipelineContext {
  return {
    hasOpenAi: false,
    hasOpenRouter,
    openRouterModel: 'mock',
    embedText: vi.fn(),
    llmChoose,
    loadCandidatesByName: vi.fn(),
    loadCandidatesByVector: vi.fn(),
    readCache: vi.fn(),
    writeCache: vi.fn(),
  } as unknown as PipelineContext;
}

describe('llmFallback', () => {
  it('returns null when OpenRouter is not configured', async () => {
    const ctx = ctxWith(vi.fn(), false);
    const res = await llmFallback('milk', [candidate('a')], ctx);
    expect(res).toBeNull();
  });

  it('returns null when shortlist is empty', async () => {
    const ctx = ctxWith(vi.fn());
    expect(await llmFallback('milk', [], ctx)).toBeNull();
  });

  it('passes through when LLM picks a shortlist id', async () => {
    const ctx = ctxWith(
      vi.fn().mockResolvedValue({ chosenId: 'a', confidence: 0.8, reasoning: 'good' }),
    );
    const res = await llmFallback('milk', [candidate('a'), candidate('b')], ctx);
    expect(res?.chosenId).toBe('a');
  });

  it('rejects hallucinated IDs not in the shortlist', async () => {
    const ctx = ctxWith(
      vi.fn().mockResolvedValue({ chosenId: 'INVENTED', confidence: 0.9, reasoning: 'oops' }),
    );
    const res = await llmFallback('milk', [candidate('a'), candidate('b')], ctx);
    expect(res?.chosenId).toBeNull();
    expect(res?.reasoning).toMatch(/outside shortlist/);
  });

  it('passes through declines (null chosenId)', async () => {
    const ctx = ctxWith(
      vi.fn().mockResolvedValue({ chosenId: null, confidence: 0, reasoning: 'unsure' }),
    );
    const res = await llmFallback('xqzy', [candidate('a')], ctx);
    expect(res?.chosenId).toBeNull();
  });
});
