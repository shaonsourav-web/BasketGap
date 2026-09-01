import type {
  LlmChooseInput,
  LlmChooseOutput,
  PipelineContext,
} from '@basketgap/shared/matching/types';

export interface LlmCappedContext extends PipelineContext {
  llmCallsMade: () => number;
  llmCapReached: () => boolean;
}

/**
 * Hard per-request ceiling on LLM disambiguation calls. Semantics unchanged by
 * the provider swap: once the cap is hit, further lines resolve on the
 * deterministic rank (`decidedBy='rank'`, band `needs_attention`) instead of
 * erroring — the request always returns a basket.
 *
 * Per-call cost (Gemini 2.5 Flash, USD, list rates checked 2026-09-02):
 * $0.30 / 1M input tokens, $2.50 / 1M output tokens. A choose call is roughly
 * 350 input tokens (system prompt + shortlist) and ~25 output tokens under the
 * response schema, so ≈ $0.00017 per call — about $0.0017 for a request that
 * exhausts the default cap of 10. Embeddings (gemini-embedding-001) are billed
 * separately and are an order of magnitude cheaper per line.
 */
export function withLlmCap(ctx: PipelineContext, maxCalls: number): LlmCappedContext {
  let callsMade = 0;

  const llmChoose = async (input: LlmChooseInput): Promise<LlmChooseOutput> => {
    if (callsMade >= maxCalls) {
      return { chosenId: null, confidence: 0, reasoning: 'llm-cap-reached' };
    }
    callsMade += 1;
    return ctx.llmChoose(input);
  };

  return {
    ...ctx,
    llmChoose,
    llmCallsMade: () => callsMade,
    llmCapReached: () => callsMade >= maxCalls,
  };
}
