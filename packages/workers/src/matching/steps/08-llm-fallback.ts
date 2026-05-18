import type { LlmChooseOutput, MatchCandidate, PipelineContext } from '../types.ts';

export async function llmFallback(
  cleaned: string,
  shortlist: MatchCandidate[],
  ctx: PipelineContext,
): Promise<LlmChooseOutput | null> {
  if (!ctx.hasOpenRouter) return null;
  if (shortlist.length === 0) return null;
  const result = await ctx.llmChoose({ cleaned, shortlist });
  if (result.chosenId == null) return result;
  const allowed = new Set(shortlist.map((c) => c.canonicalProductId));
  if (!allowed.has(result.chosenId)) {
    return {
      chosenId: null,
      confidence: 0,
      reasoning: `LLM returned id outside shortlist: ${result.chosenId}`,
    };
  }
  return result;
}
