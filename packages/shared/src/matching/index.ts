export { matchLine, matchBasket } from './pipeline.ts';
export type {
  ConfidenceBand,
  DecidedBy,
  MatchCandidate,
  MatchAuditEntry,
  MatchResult,
  PipelineContext,
  CachedMatch,
  RawCandidateRow,
  LlmChooseInput,
  LlmChooseOutput,
} from './types.ts';
export { BAND_THRESHOLDS, RANK_WEIGHTS } from './types.ts';
export { cleanLine } from './steps/01-clean.ts';
export { spellCorrect } from './steps/02-spell-correct.ts';
export { expandShorthand, expandShorthandDetailed } from './steps/03-shorthand.ts';
export type { ShorthandExpansion } from './steps/03-shorthand.ts';
export { extractQuantitySize } from './steps/04-quantity-size.ts';
export { rankCandidates } from './steps/07-rank.ts';
export { buildCacheKey, hashCleanedInput } from './steps/09-cache.ts';
export { CANONICAL_SEED } from './seed/canonical-seed.ts';
export { deterministicUuid } from './seed/uuid.ts';
