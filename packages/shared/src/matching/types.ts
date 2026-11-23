export type ConfidenceBand = 'matched' | 'assumed' | 'needs_attention';

export type DecidedBy = 'direct' | 'vector' | 'rank' | 'llm' | 'cache' | 'none';

export interface MatchCandidate {
  canonicalProductId: string;
  name: string;
  brand: string | null;
  category: string | null;
  unitSizeValue: number | null;
  unitSizeUom: string | null;
  textSimilarity: number;
  vectorSimilarity: number;
  sizeMatch: number;
  brandMatch: number;
  popularityPrior: number;
  finalScore: number;
}

export interface MatchAuditEntry {
  step: string;
  durationMs: number;
  notes: string;
}

export interface MatchResult {
  raw: string;
  cleaned: string;
  cleanedInputHash: string;
  band: ConfidenceBand;
  decidedBy: DecidedBy;
  canonicalProductId: string | null;
  top: MatchCandidate | null;
  alternatives: MatchCandidate[];
  audit: MatchAuditEntry[];
}

export interface PipelineContext {
  /** Embedding tier available (vector search runs); false → trigram-only. */
  hasEmbeddings: boolean;
  /** LLM tier available (disambiguation fallback runs); false → rank-only. */
  hasLlm: boolean;
  /** Provider-agnostic model id used for the LLM fallback. */
  llmModel: string;
  embedText: (text: string) => Promise<number[]>;
  llmChoose: (input: LlmChooseInput) => Promise<LlmChooseOutput>;
  loadCandidatesByName: (cleaned: string, brand: string | null) => Promise<RawCandidateRow[]>;
  /** Lowercased brand names from the canonical catalogue; optional so mocked contexts stay minimal. */
  loadKnownBrands?: () => Promise<string[]>;
  loadCandidatesByVector: (embedding: number[]) => Promise<RawCandidateRow[]>;
  readCache: (hash: string) => Promise<CachedMatch | null>;
  writeCache: (hash: string, cleaned: string, result: MatchResult) => Promise<void>;
}

export interface RawCandidateRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unitSizeValue: number | null;
  unitSizeUom: string | null;
  /** Similarity of the cleaned line to the product NAME only — never brand. */
  textSimilarity?: number;
  /** Similarity of the extracted brand to the product's brand, when both exist. */
  brandSimilarity?: number;
  vectorSimilarity?: number;
  popularityPrior?: number;
}

export interface LlmChooseInput {
  cleaned: string;
  shortlist: MatchCandidate[];
}

export interface LlmChooseOutput {
  chosenId: string | null;
  confidence: number;
  reasoning: string;
  /** Set by the request cap when the provider was never called. */
  skipped?: 'llm-cap-reached';
}

export interface CachedMatch {
  canonicalProductId: string | null;
  confidenceBand: ConfidenceBand;
  alternatives: MatchCandidate[];
  decidedBy: DecidedBy;
}

export const RANK_WEIGHTS = {
  text: 0.35,
  vector: 0.3,
  size: 0.15,
  brand: 0.1,
  popularity: 0.1,
} as const;

export const BAND_THRESHOLDS = {
  matched: 0.8,
  assumed: 0.55,
} as const;
