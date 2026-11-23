import type { ProductOffers, RetailerOffer } from '@basketgap/shared/pricing/types';
import assert from 'node:assert/strict';
import { it } from 'vitest';

import { createMatchRoute } from '../routes/match.ts';
import { createOfflineContext } from '../../../shared/src/matching/__tests__/eval/offline-catalogue.ts';
import { compareWithApi } from '../../../mobile/src/compare-api.ts';
import { freshness } from '../../../mobile/src/format.ts';

const fetchedAt = '2026-11-18T04:00:00.000Z';
function offer(retailer: RetailerOffer['retailer'], specialPrice: number): RetailerOffer {
  return {
    retailer,
    specialPrice,
    fetchedAt,
    productName: 'Synthetic test item',
    regularPrice: null,
    savingsAmount: null,
    savingsPercent: null,
    promoType: 'special',
    promoLabel: null,
    multiBuy: false,
    memberLocked: false,
    sizeText: null,
    state: null,
    sourceLabel: 'test',
    validTo: null,
  };
}

it('compares synthetic mobile offers through the real keyless match route', async () => {
  const originalFetch = globalThis.fetch;
  let failOffers = false;
  let resolvedState: string | null = 'VIC';
  const route = createMatchRoute({
    getContext: createOfflineContext,
    getMaxLlmCalls: () => 0,
    resolveState: async () => resolvedState,
    loadOffers: async (ids): Promise<Map<string, ProductOffers>> => {
      if (failOffers) throw new Error('Synthetic offers outage');
      return new Map(
        ids.map((id, index) => [
          id,
          {
            canonicalProductId: id,
            coles: offer('coles', index === 0 ? 2.15 : 9),
            woolworths: index === 0 ? offer('woolworths', 2.4) : null,
          },
        ]),
      );
    },
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://localhost/api/match');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      lines: ['full cream milk 2L', 'tomato paste', 'zzzxxy', 'eggs half dozen'],
      postcode: '3121',
    });
    return route.request('/', init);
  };

  const list = '• 2 × full cream milk 2L\n\ntomato paste\nzzzxxy\neggs half dozen';
  const compare = () => compareWithApi(list, '3121', undefined, 'http://localhost');
  try {
    const result = await compare();
    assert.equal(result.isSample, false);
    assert.equal(result.pricedLines.length, 1);
    assert.equal(result.singlePriceLines.length, 1);
    assert.equal(result.notOnSpecialLines.length, 2);
    assert.equal(result.lines[0]?.raw, '2 × full cream milk 2L');
    assert.equal(result.lines[0]?.quantity, 2);
    assert.equal(result.lines[1]?.woolworths, null);
    assert.equal(result.lines[2]?.coles, null);
    assert.equal(result.lines[3]?.coles, null);
    assert.equal(result.colesTotal, 4.3);
    assert.equal(result.woolworthsTotal, 4.8);
    assert.equal(result.split.total, 4.3);
    assert.equal(result.pricedAt?.toISOString(), fetchedAt);
    resolvedState = null;
    assert.equal((await compare()).limitedPostcodeCoverage, true);
    failOffers = true;
    await assert.rejects(compare, /temporarily unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('labels catalogue dates relative to the shopper’s local calendar', () => {
  const now = new Date(2026, 10, 23, 12);
  assert.match(freshness(new Date(2026, 10, 23, 6), now), /today$/);
  assert.match(freshness(new Date(2026, 10, 22, 6), now), /yesterday$/);
  assert.match(freshness(new Date(2026, 10, 18, 6), now), /18 Nov 2026/);
});
