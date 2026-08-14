import type {
  LlmChooseInput,
  LlmChooseOutput,
  PipelineContext,
} from '@basketgap/shared/matching/types';

export interface LlmCappedContext extends PipelineContext {
  llmCallsMade: () => number;
  llmCapReached: () => boolean;
}

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
