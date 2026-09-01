import type { PipelineContext, RawCandidateRow } from '../types.ts';

export async function vectorSearch(
  cleaned: string,
  ctx: PipelineContext,
): Promise<RawCandidateRow[]> {
  if (!cleaned || !ctx.hasEmbeddings) return [];
  const embedding = await ctx.embedText(cleaned);
  return ctx.loadCandidatesByVector(embedding);
}
