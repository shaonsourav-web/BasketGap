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
 * Per-call cost (OpenAI gpt-6-luna, USD, list rates checked 2026-11-01):
 * $0.10 / 1M input tokens, $0.50 / 1M output tokens. A choose call is roughly
 * 350 input tokens (system prompt + shortlist) and ~25 output tokens under the
 * response schema, so ≈ $0.00005 per call — about $0.0005 for a request that
 * exhausts the default cap of 10. Embeddings (gemini-embedding-001) are billed
 * separately, on the Google account, and are not counted against this cap.
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
