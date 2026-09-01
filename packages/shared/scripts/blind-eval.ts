/**
 * Scores the offline deterministic pipeline against an EXTERNAL gold set —
 * a JSON array of {line, expect} where expect is an exact canonical seed name
 * or null for out-of-catalogue lines. The set is produced by an independent
 * model (never by the engine's authors) per the eval-independence rule.
 *
 * Run: pnpm exec tsx scripts/blind-eval.ts <gold.json> [--failures]
 */
import { readFileSync } from 'node:fs';

import { matchLine } from '../src/matching/pipeline.ts';
import {
  createOfflineContext,
  CATALOGUE,
} from '../src/matching/__tests__/eval/offline-catalogue.ts';

interface GoldCase {
  line: string;
  expect: string | null;
}

const [, , goldPath, ...flags] = process.argv;
if (!goldPath) {
  console.error('usage: tsx scripts/blind-eval.ts <gold.json> [--failures]');
  process.exit(2);
}
const showFailures = flags.includes('--failures');
const gold: GoldCase[] = JSON.parse(readFileSync(goldPath, 'utf8'));

const validNames = new Set(CATALOGUE.map((r) => r.name));
const badLabels = gold.filter((g) => g.expect !== null && !validNames.has(g.expect));
if (badLabels.length > 0) {
  console.error(`gold set has ${badLabels.length} labels not in the catalogue:`);
  for (const b of badLabels.slice(0, 20)) console.error(`  ${JSON.stringify(b)}`);
  process.exit(2);
}

interface Failure {
  line: string;
  expect: string | null;
  got: string | null;
  band: string;
}

let correctMatch = 0; // expected product, engine picked it
let wrongPick = 0; // engine accepted a different product (worst failure)
let missedDefer = 0; // in catalogue, engine deferred
let correctDefer = 0; // out of catalogue, engine deferred
let falseAccept = 0; // out of catalogue, engine accepted something
const failures: Failure[] = [];

const ctx = createOfflineContext();
for (const g of gold) {
  const r = await matchLine(g.line, ctx);
  const accepted = r.band !== 'needs_attention' && r.top != null;
  const got = accepted ? r.top!.name : null;
  if (g.expect === null) {
    if (!accepted) correctDefer++;
    else {
      falseAccept++;
      failures.push({ line: g.line, expect: null, got, band: r.band });
    }
  } else {
    if (accepted && got === g.expect) correctMatch++;
    else if (accepted) {
      wrongPick++;
      failures.push({ line: g.line, expect: g.expect, got, band: r.band });
    } else {
      missedDefer++;
      failures.push({ line: g.line, expect: g.expect, got: null, band: r.band });
    }
  }
}

const inCat = gold.filter((g) => g.expect !== null).length;
const outCat = gold.length - inCat;
const accepted = correctMatch + wrongPick + falseAccept;
const pct = (a: number, b: number) => (b === 0 ? '—' : ((100 * a) / b).toFixed(1) + '%');

console.log(`gold lines            : ${gold.length} (${inCat} in-catalogue, ${outCat} out)`);
console.log(`correct match         : ${correctMatch}/${inCat} (${pct(correctMatch, inCat)})`);
console.log(`missed (deferred)     : ${missedDefer}/${inCat} (${pct(missedDefer, inCat)})`);
console.log(`WRONG PICK            : ${wrongPick}/${inCat} (${pct(wrongPick, inCat)})`);
console.log(`correct deferral      : ${correctDefer}/${outCat} (${pct(correctDefer, outCat)})`);
console.log(`FALSE ACCEPT          : ${falseAccept}/${outCat} (${pct(falseAccept, outCat)})`);
console.log(`accepted precision    : ${pct(correctMatch, accepted)} of ${accepted} accepted`);
console.log(
  `overall               : ${pct(correctMatch + correctDefer, gold.length)} correct decisions`,
);

if (showFailures) {
  console.log('\n--- failures ---');
  for (const f of failures) {
    console.log(
      `${JSON.stringify(f.line)} expect=${JSON.stringify(f.expect)} got=${JSON.stringify(f.got)} band=${f.band}`,
    );
  }
}
