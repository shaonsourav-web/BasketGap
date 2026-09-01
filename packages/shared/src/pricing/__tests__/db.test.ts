import { describe, expect, it } from 'vitest';

import type { Db } from '../../db/client.ts';
import { loadOffersForCanonicalIds, resolveStateForPostcode } from '../db.ts';

const PRODUCT_A = '88888888-2222-1111-1111-000000000001';
const PRODUCT_B = '88888888-2222-1111-1111-000000000002';

function fakeDb(rows: unknown[]): { db: Db; queries: unknown[] } {
  const queries: unknown[] = [];
  const db = {
    execute: async (query: unknown) => {
      queries.push(query);
      return rows;
    },
  } as unknown as Db;
  return { db, queries };
}

function offerRow(overrides: Record<string, unknown> = {}) {
  return {
    canonical_product_id: PRODUCT_A,
    retailer: 'coles',
    special_price: '4.50',
    regular_price: '9.00',
    savings_amount: '4.50',
    savings_percent: '50.00',
    promo_type: 'half_price',
    promo_label: '1/2 Price',
    multi_buy: false,
    is_member_locked: false,
    product_name: 'Cadbury Dairy Milk 180g',
    size_text: '180g',
    state: 'NSW',
    source_label: 'coles-weekly',
    valid_to: '2026-09-02',
    fetched_at: '2026-08-27 09:00:00+10',
    ...overrides,
  };
}

describe('loadOffersForCanonicalIds', () => {
  it('returns an empty map without querying when no ids are given', async () => {
    const { db, queries } = fakeDb([offerRow()]);
    const result = await loadOffersForCanonicalIds(db, []);
    expect(result.size).toBe(0);
    expect(queries.length).toBe(0);
  });

  it('maps numeric strings to numbers and groups offers per product and retailer', async () => {
    const { db } = fakeDb([
      offerRow(),
      offerRow({
        retailer: 'woolworths',
        special_price: '5.00',
        regular_price: null,
        savings_amount: null,
        savings_percent: null,
        promo_type: 'prices_dropped',
        promo_label: 'Prices Dropped',
        source_label: 'woolies-web',
      }),
      offerRow({ canonical_product_id: PRODUCT_B, retailer: 'woolworths', special_price: '2.20' }),
    ]);

    const result = await loadOffersForCanonicalIds(db, [PRODUCT_A, PRODUCT_B]);

    expect(result.size).toBe(2);
    const a = result.get(PRODUCT_A)!;
    expect(a.coles).toMatchObject({
      retailer: 'coles',
      specialPrice: 4.5,
      regularPrice: 9,
      savingsAmount: 4.5,
      savingsPercent: 50,
      promoType: 'half_price',
      memberLocked: false,
    });
    expect(a.woolworths).toMatchObject({
      retailer: 'woolworths',
      specialPrice: 5,
      regularPrice: null,
      savingsAmount: null,
      promoType: 'prices_dropped',
    });
    const b = result.get(PRODUCT_B)!;
    expect(b.coles).toBeNull();
    expect(b.woolworths?.specialPrice).toBe(2.2);
  });

  it('ignores rows for unknown retailers rather than crashing', async () => {
    const { db } = fakeDb([offerRow({ retailer: 'aldi' }), offerRow()]);
    const result = await loadOffersForCanonicalIds(db, [PRODUCT_A]);
    const a = result.get(PRODUCT_A)!;
    expect(a.coles?.specialPrice).toBe(4.5);
    expect(a.woolworths).toBeNull();
  });

  it('deduplicates requested ids and drops empty strings', async () => {
    const { db, queries } = fakeDb([]);
    await loadOffersForCanonicalIds(db, [PRODUCT_A, PRODUCT_A, '']);
    expect(queries.length).toBe(1);
  });
});

describe('resolveStateForPostcode', () => {
  it('returns the zone state when found and null otherwise', async () => {
    expect(await resolveStateForPostcode(fakeDb([{ state: 'VIC' }]).db, '3000')).toBe('VIC');
    expect(await resolveStateForPostcode(fakeDb([]).db, '9999')).toBeNull();
  });
});
