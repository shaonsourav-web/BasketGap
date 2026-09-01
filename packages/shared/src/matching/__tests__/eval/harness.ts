import { writeSync } from 'node:fs';

import { matchLine } from '../../pipeline.ts';
import type { ConfidenceBand, PipelineContext } from '../../types.ts';

import { LABELLED_LINES, type LabelledLine } from './labelled-lines.ts';
import { createOfflineContext } from './offline-catalogue.ts';

export const BANDS: ConfidenceBand[] = ['matched', 'assumed', 'needs_attention'];

export interface EvalOutcome {
  line: string;
  expected: string | null;
  actual: string | null;
  actualId: string | null;
  band: ConfidenceBand;
  decidedBy: string;
  score: number;
  correct: boolean;
  tags: string[];
}

export interface BandStats {
  total: number;
  correct: number;
  precision: number;
}

export interface EvalReport {
  total: number;
  bands: Record<ConfidenceBand, BandStats>;
  needsAttentionRate: number;
  overallAccuracy: number;
  /** Lines whose expected canonical exists in the catalogue. */
  inCatalogue: { total: number; resolvedCorrectly: number; recall: number };
  /** Lines deliberately labelled `null` (no correct catalogue answer). */
  outOfCatalogue: { total: number; correctlyDeferred: number; rate: number };
  mismatches: EvalOutcome[];
  outcomes: EvalOutcome[];
}

/**
 * A line is "correct" when the engine's answer agrees with the label:
 *  - labelled with a canonical name → the top canonical must be that product
 *    **and** the result must not be `needs_attention` (silence is not an answer);
 *  - labelled `null` → the engine must land `needs_attention` (deferring to the
 *    user is the right answer when the catalogue cannot serve the line).
 */
function isCorrect(expected: string | null, actual: string | null, band: ConfidenceBand): boolean {
  if (expected === null) return band === 'needs_attention';
  if (band === 'needs_attention') return false;
  return actual != null && actual.toLowerCase() === expected.toLowerCase();
}

export async function runEval(
  lines: LabelledLine[] = LABELLED_LINES,
  ctx: PipelineContext = createOfflineContext(),
): Promise<EvalReport> {
  const outcomes: EvalOutcome[] = [];

  for (const labelled of lines) {
    const result = await matchLine(labelled.line, ctx);
    const actual = result.top?.name ?? null;
    outcomes.push({
      line: labelled.line,
      expected: labelled.expected,
      actual: result.band === 'needs_attention' ? null : actual,
      actualId: result.canonicalProductId,
      band: result.band,
      decidedBy: result.decidedBy,
      score: Math.round((result.top?.finalScore ?? 0) * 1000) / 1000,
      correct: isCorrect(labelled.expected, actual, result.band),
      tags: labelled.tags ?? [],
    });
  }

  const bands = {} as Record<ConfidenceBand, BandStats>;
  for (const band of BANDS) {
    const inBand = outcomes.filter((o) => o.band === band);
    const correct = inBand.filter((o) => o.correct).length;
    bands[band] = {
      total: inBand.length,
      correct,
      precision: inBand.length === 0 ? 0 : correct / inBand.length,
    };
  }

  const inCat = outcomes.filter((o) => o.expected !== null);
  const outCat = outcomes.filter((o) => o.expected === null);
  const inCatCorrect = inCat.filter((o) => o.correct).length;
  const outCatCorrect = outCat.filter((o) => o.correct).length;

  return {
    total: outcomes.length,
    bands,
    needsAttentionRate: bands.needs_attention.total / (outcomes.length || 1),
    overallAccuracy: outcomes.filter((o) => o.correct).length / (outcomes.length || 1),
    inCatalogue: {
      total: inCat.length,
      resolvedCorrectly: inCatCorrect,
      recall: inCat.length === 0 ? 0 : inCatCorrect / inCat.length,
    },
    outOfCatalogue: {
      total: outCat.length,
      correctlyDeferred: outCatCorrect,
      rate: outCat.length === 0 ? 0 : outCatCorrect / outCat.length,
    },
    mismatches: outcomes.filter((o) => !o.correct),
    outcomes,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

/** Small fixed-width summary, printed by the vitest run so the baseline is visible. */
export function formatReport(report: EvalReport, mismatchLimit = 25): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('┌─ matching eval harness (offline deterministic path) ──────────────');
  lines.push(`│ labelled lines: ${report.total}`);
  lines.push('│');
  lines.push(`│ ${pad('band', 18)}${pad('n', 6)}${pad('correct', 9)}precision`);
  for (const band of BANDS) {
    const s = report.bands[band];
    lines.push(
      `│ ${pad(band, 18)}${pad(String(s.total), 6)}${pad(String(s.correct), 9)}${pct(s.precision)}`,
    );
  }
  lines.push('│');
  lines.push(`│ needs_attention rate : ${pct(report.needsAttentionRate)}`);
  lines.push(`│ overall accuracy     : ${pct(report.overallAccuracy)}`);
  lines.push(
    `│ in-catalogue recall  : ${pct(report.inCatalogue.recall)} ` +
      `(${report.inCatalogue.resolvedCorrectly}/${report.inCatalogue.total})`,
  );
  lines.push(
    `│ out-of-catalogue     : ${pct(report.outOfCatalogue.rate)} correctly deferred ` +
      `(${report.outOfCatalogue.correctlyDeferred}/${report.outOfCatalogue.total})`,
  );
  lines.push('│');
  lines.push(`│ mismatches: ${report.mismatches.length}`);
  for (const m of report.mismatches.slice(0, mismatchLimit)) {
    lines.push(
      `│   ${pad(`"${m.line}"`, 30)} expected ${pad(m.expected ?? '<none>', 28)}` +
        `got ${pad(m.actual ?? '<none>', 28)}[${m.band} ${m.score}]`,
    );
  }
  if (report.mismatches.length > mismatchLimit) {
    lines.push(`│   … ${report.mismatches.length - mismatchLimit} more`);
  }
  lines.push('└──────────────────────────────────────────────────────────────────');
  return lines.join('\n');
}

/**
 * Writes the summary straight to fd 1. Vitest's default reporter swallows
 * `console.log` from passing tests, and the whole point of this suite is the
 * baseline it prints — so the report bypasses the console interceptor and is
 * visible in a plain `pnpm -r test` run.
 */
export function printReport(report: EvalReport, mismatchLimit = 25): void {
  writeSync(1, `${formatReport(report, mismatchLimit)}\n`);
}
