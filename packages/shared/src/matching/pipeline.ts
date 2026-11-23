import { buildCacheKey, hashCleanedInput } from './steps/09-cache.ts';
import { cleanLine } from './steps/01-clean.ts';
import { spellCorrect } from './steps/02-spell-correct.ts';
import { expandShorthandDetailed } from './steps/03-shorthand.ts';
import { extractQuantitySize } from './steps/04-quantity-size.ts';
import { extractBrand } from './lib/brand.ts';
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
  const shorthand = stepAudit(
    audit,
    'shorthand',
    () => expandShorthandDetailed(corrected),
    (out) => (out.headDefaultApplied ? `head-default: ${out.headDefaultNote}` : ''),
  );
  const expanded = shorthand.expanded;
  const headDefaultApplied = shorthand.headDefaultApplied;
  const qty = stepAudit(audit, 'quantity-size', () => extractQuantitySize(expanded));
  const cleanedForMatch = qty.residual || expanded;
  const cleanedInputHash = hashCleanedInput(
    buildCacheKey({
      cleaned: cleanedForMatch,
      sizeValue: qty.sizeValue,
      sizeUom: qty.sizeUom,
      quantity: qty.quantity,
      headDefaultApplied,
    }),
  );

  const cached = await stepAuditAsync(audit, 'cache-read', () => ctx.readCache(cleanedInputHash));
  if (cached && cached.confidenceBand !== 'needs_attention') {
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

  let brand: string | null = null;
  const nameQuery = cleanedForMatch;
  if (ctx.loadKnownBrands) {
    const extracted = await stepAuditAsync(audit, 'brand-extract', async () => {
      const brands = await ctx.loadKnownBrands!();
      return extractBrand(cleanedForMatch, new Set(brands));
    });
    // The brand token stays in the name query: many canonical names carry the
    // brand ("Vegemite Spread", "Weet-Bix Cereal"), and stripping it collapsed
    // their similarity to the residual ("spread", "cereal"). extractBrand's
    // job here is only to supply the brand signal for rank.
    if (extracted.brand) brand = extracted.brand;
  }

  const direct = await stepAuditAsync(audit, 'direct-lookup', () =>
    directLookup(nameQuery, brand, ctx),
  );
  const vector = await stepAuditAsync(audit, 'vector-search', () =>
    vectorSearch(cleanedForMatch, ctx),
  );

  const ranked = stepAudit(audit, 'rank', () =>
    rankCandidates({
      cleaned: nameQuery,
      brand,
      sizeValue: qty.sizeValue,
      sizeUom: qty.sizeUom,
      quantity: qty.quantity,
      directCandidates: direct,
      vectorCandidates: vector,
    }),
  );

  let top = ranked[0] ?? null;
  let decidedBy: DecidedBy = top ? (direct.length > 0 ? 'direct' : 'rank') : 'none';

  if ((top?.finalScore ?? 0) < BAND_THRESHOLDS.assumed) {
    const llm = await stepAuditAsync(
      audit,
      'llm-fallback',
      () => llmFallback(cleanedForMatch, ranked, ctx),
      (out) => out?.skipped ?? '',
    );
    if (llm?.chosenId) {
      const chosen = ranked.find((c) => c.canonicalProductId === llm.chosenId);
      if (chosen) {
        top = { ...chosen, finalScore: Math.max(chosen.finalScore, llm.confidence) };
        decidedBy = 'llm';
      }
    }
  }

  // A bare generic head ("coffee", "rice", "milk 1 L") was resolved to the
  // catalogue's default variant, so the product identity is the engine's
  // assumption rather than the shopper's words. Such a line may never present
  // as `matched`; it is held at `assumed` so the UI can flag it for review.
  // The score itself is left truthful — only the band is capped — and the cap
  // is recorded in the audit trail.
  let band = bandFor(top?.finalScore ?? 0);
  if (headDefaultApplied && band === 'matched') {
    band = 'assumed';
    audit.push({
      step: 'head-default-band-cap',
      durationMs: 0,
      notes: `capped matched → assumed (score ${(top?.finalScore ?? 0).toFixed(3)})`,
    });
  }
  const result = finalise({
    raw,
    cleaned: cleanedForMatch,
    cleanedInputHash,
    band,
    decidedBy,
    canonicalProductId: band === 'needs_attention' ? null : (top?.canonicalProductId ?? null),
    top,
    alternatives: ranked,
    audit,
    t0,
  });

  if (band !== 'needs_attention') {
    await stepAuditAsync(audit, 'cache-write', () =>
      ctx.writeCache(cleanedInputHash, cleanedForMatch, result),
    );
  }
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

function stepAudit<T>(
  audit: MatchAuditEntry[],
  step: string,
  fn: () => T,
  notesFor?: (out: T) => string,
): T {
  const t0 = performance.now();
  const out = fn();
  audit.push({
    step,
    durationMs: Math.round(performance.now() - t0),
    notes: notesFor ? notesFor(out) : '',
  });
  return out;
}

async function stepAuditAsync<T>(
  audit: MatchAuditEntry[],
  step: string,
  fn: () => Promise<T>,
  notesFor?: (out: T) => string,
): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  audit.push({
    step,
    durationMs: Math.round(performance.now() - t0),
    notes: notesFor?.(out) ?? '',
  });
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
