import type { PipelineContext, RawCandidateRow } from '../types.ts';

export async function directLookup(
  cleaned: string,
  brand: string | null,
  ctx: PipelineContext,
): Promise<RawCandidateRow[]> {
  if (!cleaned) return [];
  return ctx.loadCandidatesByName(cleaned, brand);
}
