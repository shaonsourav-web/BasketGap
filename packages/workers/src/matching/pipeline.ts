import { hashCleanedInput } from './steps/09-cache.ts';
import { cleanLine } from './steps/01-clean.ts';
import { spellCorrect } from './steps/02-spell-correct.ts';
import { expandShorthand } from './steps/03-shorthand.ts';
import { extractQuantitySize } from './steps/04-quantity-size.ts';
import { directLookup } from './steps/05-direct-lookup.ts';
import { vectorSearch } from './steps/06-vector-search.ts';
import { rankCandidates } from './steps/07-rank.ts';
import { llmFallback } from './steps/08-llm-fallback.ts';
import {
  BAND_THRESHOLDS,
  type ConfidenceBand,
  type DecidedBy,
  type MatchAuditEntry,
  type MatchCandidate,
  type MatchResult,
  type PipelineContext,
} from './types.ts';

export async function matchLine(raw: string, ctx: PipelineContext): Promise<MatchResult> {
  const audit: MatchAuditEntry[] = [];
  const t0 = performance.now();

  const cleaned = stepAudit(audit, 'clean', () => cleanLine(raw));
  const corrected = stepAudit(audit, 'spell-correct', () => spellCorrect(cleaned));
  const expanded = stepAudit(audit, 'shorthand', () => expandShorthand(corrected));
  const qty = stepAudit(audit, 'quantity-size', () => extractQuantitySize(expanded));
  const cleanedForMatch = qty.residual || expanded;
  const cleanedInputHash = hashCleanedInput(cleanedForMatch);

  const cached = await stepAuditAsync(audit, 'cache-read', () => ctx.readCache(cleanedInputHash));
  if (cached) {
    return finalise({
      raw,
      cleaned: cleanedForMatch,
      cleanedInputHash,
      band: cached.confidenceBand,
      decidedBy: 'cache',
      canonicalProductId: cached.canonicalProductId,
      top: cached.alternatives[0] ?? null,
      alternatives: cached.alternatives,
      audit,
      t0,
    });
  }

  const direct = await stepAuditAsync(audit, 'direct-lookup', () =>
    directLookup(cleanedForMatch, null, ctx),
  );
  const vector = await stepAuditAsync(audit, 'vector-search', () =>
    vectorSearch(cleanedForMatch, ctx),
  );

  const ranked = stepAudit(audit, 'rank', () =>
    rankCandidates({
      cleaned: cleanedForMatch,
      brand: null,
      sizeValue: qty.sizeValue,
      sizeUom: qty.sizeUom,
      directCandidates: direct,
      vectorCandidates: vector,
    }),
  );

  let top = ranked[0] ?? null;
  let decidedBy: DecidedBy = top ? (direct.length > 0 ? 'direct' : 'rank') : 'none';

  if ((top?.finalScore ?? 0) < BAND_THRESHOLDS.assumed) {
    const llm = await stepAuditAsync(audit, 'llm-fallback', () =>
      llmFallback(cleanedForMatch, ranked, ctx),
    );
    if (llm?.chosenId) {
      const chosen = ranked.find((c) => c.canonicalProductId === llm.chosenId);
      if (chosen) {
        top = { ...chosen, finalScore: Math.max(chosen.finalScore, llm.confidence) };
        decidedBy = 'llm';
      }
    }
  }

  const band = bandFor(top?.finalScore ?? 0);
  const result = finalise({
    raw,
    cleaned: cleanedForMatch,
    cleanedInputHash,
    band,
    decidedBy,
    canonicalProductId: top?.canonicalProductId ?? null,
    top,
    alternatives: ranked,
    audit,
    t0,
  });

  await stepAuditAsync(audit, 'cache-write', () =>
    ctx.writeCache(cleanedInputHash, cleanedForMatch, result),
  );
  return result;
}

export async function matchBasket(lines: string[], ctx: PipelineContext): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  for (const line of lines) {
    if (line.trim()) {
      results.push(await matchLine(line, ctx));
    }
  }
  return results;
}

function stepAudit<T>(audit: MatchAuditEntry[], step: string, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  audit.push({ step, durationMs: Math.round(performance.now() - t0), notes: '' });
  return out;
}

async function stepAuditAsync<T>(
  audit: MatchAuditEntry[],
  step: string,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  audit.push({ step, durationMs: Math.round(performance.now() - t0), notes: '' });
  return out;
}

function bandFor(score: number): ConfidenceBand {
  if (score >= BAND_THRESHOLDS.matched) return 'matched';
  if (score >= BAND_THRESHOLDS.assumed) return 'assumed';
  return 'needs_attention';
}

function finalise(args: {
  raw: string;
  cleaned: string;
  cleanedInputHash: string;
  band: ConfidenceBand;
  decidedBy: DecidedBy;
  canonicalProductId: string | null;
  top: MatchCandidate | null;
  alternatives: MatchCandidate[];
  audit: MatchAuditEntry[];
  t0: number;
}): MatchResult {
  args.audit.push({
    step: 'total',
    durationMs: Math.round(performance.now() - args.t0),
    notes: '',
  });
  return {
    raw: args.raw,
    cleaned: args.cleaned,
    cleanedInputHash: args.cleanedInputHash,
    band: args.band,
    decidedBy: args.decidedBy,
    canonicalProductId: args.canonicalProductId,
    top: args.top,
    alternatives: args.alternatives,
    audit: args.audit,
  };
}
