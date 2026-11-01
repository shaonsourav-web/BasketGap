/**
 * Prints Coles / Woolworths / gap for the sample budget scenarios.
 * Run: pnpm --filter @basketgap/mobile exec tsx src/mock/verify-scenarios.ts
 */
import { compareBasket } from './compare';
import { BASKET_SCENARIOS } from './scenarios';

const MAX_DRIFT = 40; // sample baskets are only roughly sized to their label
const MIN_PRICED_RATE = 0.65;

let failed = false;

for (const scenario of BASKET_SCENARIOS) {
  const result = compareBasket(scenario.list, '3121', new Date('2026-09-06T18:00:00+10:00'));
  const cheaper = Math.min(result.colesTotal, result.woolworthsTotal);
  const drift = cheaper - scenario.target;
  const priced = result.pricedLines.length;
  const single = result.singlePriceLines.length;
  const skipped = result.notOnSpecialLines.length;
  const pricedRate = result.lines.length ? priced / result.lines.length : 0;
  const within = Math.abs(drift) <= MAX_DRIFT;
  const coverageOk = pricedRate >= MIN_PRICED_RATE;
  // Every scenario should exercise the one-retailer and no-special states.
  const statesOk = single > 0 && skipped > 0;

  if (!within || !coverageOk || !statesOk) failed = true;

  console.log(
    [
      within && coverageOk && statesOk ? 'OK ' : 'BAD',
      scenario.label.padEnd(5),
      `Coles $${result.colesTotal.toFixed(2)}`.padEnd(14),
      `Woolies $${result.woolworthsTotal.toFixed(2)}`.padEnd(16),
      `gap $${result.difference.toFixed(2)}`.padEnd(12),
      `cheaper $${cheaper.toFixed(2)} (target ${scenario.target}, drift ${drift >= 0 ? '+' : ''}${drift.toFixed(2)})`,
      `priced at both ${priced}/${result.lines.length} (${(pricedRate * 100).toFixed(0)}%), one store only ${single}, no special ${skipped}`,
    ].join(' | '),
  );
}

if (failed) {
  console.error(
    `\nFail: cheaper total within ±$${MAX_DRIFT} of target, ≥${MIN_PRICED_RATE * 100}% of lines priced at both stores, and at least one one-store and one no-special line.`,
  );
  process.exit(1);
}

console.log('\nAll sample scenarios OK.');
