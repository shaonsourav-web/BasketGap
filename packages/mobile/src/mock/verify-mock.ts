/**
 * Offline checks for the SYNTHETIC mock catalogue and compare logic.
 * Run: pnpm --filter @basketgap/mobile test
 */
import { CATALOGUE, CATALOGUE_COVERAGE } from './catalogue';
import { compareBasket } from './compare';
import { BASKET_SCENARIOS } from './scenarios';

const NOW = new Date('2026-09-06T18:00:00+10:00');
let failed = false;

function check(ok: boolean, message: string): void {
  if (!ok) {
    failed = true;
    console.error(`  FAIL ${message}`);
  }
}

console.log('=== Sample catalogue ===');
console.log(`${CATALOGUE.length} entries. ${CATALOGUE_COVERAGE.note}`);
check(CATALOGUE.length >= 60 && CATALOGUE.length <= 120, 'catalogue size within 60-120');

const both = CATALOGUE.filter((e) => e.coles !== null && e.woolworths !== null);
const colesOnly = CATALOGUE.filter((e) => e.coles !== null && e.woolworths === null);
const wooliesOnly = CATALOGUE.filter((e) => e.coles === null && e.woolworths !== null);
const neither = CATALOGUE.filter((e) => e.coles === null && e.woolworths === null);
console.log(
  `special at both ${both.length} | Coles only ${colesOnly.length} | Woolworths only ${wooliesOnly.length} | neither ${neither.length}`,
);
check(
  both.length > 0 && colesOnly.length > 0 && wooliesOnly.length > 0 && neither.length > 0,
  'all four price states present',
);
check(
  CATALOGUE.every((e) => [e.coles, e.woolworths].every((p) => p === null || p > 0)),
  'no zero or negative prices (missing must be null)',
);

console.log('\n=== Every key resolves to its own product ===');
for (const entry of CATALOGUE) {
  for (const key of entry.keys) {
    const line = compareBasket(key, '3121', NOW).lines[0];
    check(
      line?.productName === entry.name,
      `key "${key}" -> "${line?.productName}", expected "${entry.name}"`,
    );
  }
}

console.log('\n=== Unknown words stay unmatched ===');
for (const word of ['dragon fruit', 'shoe polish', 'garden gnome']) {
  const line = compareBasket(word, '3121', NOW).lines[0];
  check(
    line?.productName === null && line?.band === 'needs_attention',
    `"${word}" should not match`,
  );
}

console.log('\n=== Missing price is never zero ===');
const colesOnlyEntry = colesOnly[0]!;
const wooliesOnlyEntry = wooliesOnly[0]!;
const neitherEntry = neither[0]!;
const probe = compareBasket(
  [colesOnlyEntry.keys[0]!, wooliesOnlyEntry.keys[0]!, neitherEntry.keys[0]!].join('\n'),
  '3121',
  NOW,
);
const [cLine, wLine, nLine] = probe.lines;
check(
  cLine!.coles !== null && cLine!.woolworths === null,
  'Coles-only line keeps Woolworths price null',
);
check(
  wLine!.woolworths !== null && wLine!.coles === null,
  'Woolworths-only line keeps Coles price null',
);
check(nLine!.coles === null && nLine!.woolworths === null, 'no-special line has no prices');
check(
  cLine!.cheaper === null && wLine!.cheaper === null && cLine!.delta === 0 && wLine!.delta === 0,
  'one-store lines are never "cheaper" and carry no gap',
);
check(probe.pricedLines.length === 0, 'one-store and no-special lines are not in the totals');
check(probe.colesTotal === 0 && probe.woolworthsTotal === 0, 'totals ignore one-store lines');
check(probe.singlePriceLines.length === 2, 'two one-store lines reported');
check(probe.notOnSpecialLines.length === 1, 'one no-special line reported');

const bothEntry = both[0]!;
const mixed = compareBasket(`${bothEntry.keys[0]!}\n${colesOnlyEntry.keys[0]!}`, '3121', NOW);
check(
  mixed.colesTotal === bothEntry.coles && mixed.woolworthsTotal === bothEntry.woolworths,
  'mixed basket totals equal the both-priced line only',
);

console.log('\n=== Scenarios ===');
for (const scenario of BASKET_SCENARIOS) {
  const result = compareBasket(scenario.list, '3121', NOW);
  check(result.pricedLines.length > 0, `${scenario.label} has priced lines`);
  console.log(
    `${scenario.label}: Coles $${result.colesTotal.toFixed(2)} | Woolworths $${result.woolworthsTotal.toFixed(2)} | ${result.pricedLines.length}/${result.lines.length} priced at both`,
  );
}

if (failed) {
  console.error('\nFAILED mock verification');
  process.exit(1);
}
console.log('\nPASSED mock verification');
