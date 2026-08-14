import { beforeAll, describe, expect, it } from 'vitest';

import { BAND_THRESHOLDS } from '../../types.ts';

import { BANDS, formatReport, printReport, runEval, type EvalReport } from './harness.ts';
import { LABELLED_LINES } from './labelled-lines.ts';
import { CANONICAL_NAMES, createOfflineContext } from './offline-catalogue.ts';

/**
 * Round 8.5 Part B — the matching eval harness.
 *
 * This suite is a **measurement gate**, not a correctness suite. It runs the
 * labelled set through the real pipeline with a fully offline context (no
 * OPENAI_API_KEY, no OPENROUTER_API_KEY, no database) and prints a readable
 * quality baseline. Assertions here only guard the harness itself and a floor
 * the deterministic path genuinely clears today — they are deliberately loose
 * so the numbers stay informational and the suite never goes red for a quality
 * regression it is supposed to *report*.
 *
 * Any future band-threshold or weight change should be judged by re-running
 * this and comparing the printed report against the baseline in
 * `docs/round-8.5-engine-hardening.md`.
 */
describe('matching eval harness', () => {
  let report: EvalReport;

  beforeAll(async () => {
    report = await runEval(LABELLED_LINES, createOfflineContext());
    printReport(report);
  });

  it('labels only canonicals that exist in the seed catalogue', () => {
    const unknown = LABELLED_LINES.filter(
      (l) => l.expected !== null && !CANONICAL_NAMES.has(l.expected.toLowerCase()),
    ).map((l) => `${l.line} → ${l.expected}`);
    expect(unknown).toEqual([]);
  });

  it('has a labelled set in the 100–200 line range with unique lines', () => {
    expect(LABELLED_LINES.length).toBeGreaterThanOrEqual(100);
    expect(LABELLED_LINES.length).toBeLessThanOrEqual(200);
    expect(new Set(LABELLED_LINES.map((l) => l.line)).size).toBe(LABELLED_LINES.length);
  });

  it('includes a deliberate minority of out-of-catalogue lines', () => {
    const nulls = LABELLED_LINES.filter((l) => l.expected === null).length;
    expect(nulls).toBeGreaterThanOrEqual(10);
    expect(nulls / LABELLED_LINES.length).toBeLessThan(0.3);
  });

  it('scores every labelled line and classifies each into a known band', () => {
    expect(report.total).toBe(LABELLED_LINES.length);
    expect(report.outcomes).toHaveLength(LABELLED_LINES.length);
    for (const outcome of report.outcomes) {
      expect(BANDS).toContain(outcome.band);
    }
  });

  it('reports per-band totals that sum to the labelled set', () => {
    const sum = BANDS.reduce((acc, b) => acc + report.bands[b].total, 0);
    expect(sum).toBe(report.total);
  });

  it('never returns a canonical id on a needs_attention line', () => {
    const leaked = report.outcomes.filter(
      (o) => o.band === 'needs_attention' && o.actualId != null,
    );
    expect(leaked).toEqual([]);
  });

  it('assigns bands consistently with BAND_THRESHOLDS', () => {
    for (const o of report.outcomes) {
      if (o.band === 'matched') expect(o.score).toBeGreaterThanOrEqual(BAND_THRESHOLDS.matched);
      if (o.band === 'assumed') {
        expect(o.score).toBeGreaterThanOrEqual(BAND_THRESHOLDS.assumed);
        expect(o.score).toBeLessThan(BAND_THRESHOLDS.matched);
      }
      if (o.band === 'needs_attention') expect(o.score).toBeLessThan(BAND_THRESHOLDS.assumed);
    }
  });

  it('produces a readable report containing every band and the mismatch list', () => {
    const text = formatReport(report);
    for (const band of BANDS) expect(text).toContain(band);
    expect(text).toContain('needs_attention rate');
    expect(text).toContain('mismatches:');
  });

  it('quality floor: the deterministic path resolves the plain staple lines', () => {
    // Loose floors the offline (text-only) path clears today. They exist to
    // catch a catastrophic regression — a broken clean/shorthand/rank step —
    // not to encode a quality target.
    expect(report.bands.matched.total).toBeGreaterThan(0);
    expect(report.bands.matched.precision).toBeGreaterThanOrEqual(0.9);
    expect(report.needsAttentionRate).toBeLessThan(0.75);
  });

  it('defers rather than guessing on most out-of-catalogue lines', () => {
    expect(report.outOfCatalogue.rate).toBeGreaterThanOrEqual(0.6);
  });
});
