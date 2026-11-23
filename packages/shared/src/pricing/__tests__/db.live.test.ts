import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { createDb, createSqlClient, type Db, type SqlClient } from '../../db/client.ts';
import { canonicalProducts, catalogues, retailerSkus, specials, zones } from '../../db/schema.ts';
import { loadOffersForCanonicalIds, resolveStateForPostcode } from '../db.ts';

const SHOULD_RUN = Boolean(process.env.DATABASE_URL);
const describeIfDb = SHOULD_RUN ? describe : describe.skip;

const PRODUCT_ID = '88888888-3333-1111-1111-000000000001';
const SKU_COLES = '88888888-3333-1111-1111-000000000011';
const SKU_WOOLIES = '88888888-3333-1111-1111-000000000012';
const CATALOGUE_FRESH = '88888888-3333-1111-1111-000000000021';
const CATALOGUE_STALE = '88888888-3333-1111-1111-000000000022';
const NS = `pricing-live-${Math.random().toString(36).slice(2, 10)}`;
const TEST_POSTCODE = '0001';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describeIfDb('pricing live DB semantics', () => {
  let sqlClient: SqlClient;
  let db: Db;

  beforeAll(async () => {
    sqlClient = createSqlClient(process.env.DATABASE_URL!);
    db = createDb(sqlClient);

    await db.insert(canonicalProducts).values({
      id: PRODUCT_ID,
      name: `${NS} choc block 180g`,
      category: 'pantry',
    });
    await db.insert(retailerSkus).values([
      { id: SKU_COLES, retailer: 'coles', retailerSku: `${NS}-c1`, canonicalProductId: PRODUCT_ID },
      {
        id: SKU_WOOLIES,
        retailer: 'woolworths',
        retailerSku: `${NS}-w1`,
        canonicalProductId: PRODUCT_ID,
      },
    ]);
    await db.insert(catalogues).values([
      {
        id: CATALOGUE_FRESH,
        retailer: 'coles',
        sourceType: 'web',
        sourceLabel: `${NS}-fresh`,
        sourceUrl: 'https://example.test/fresh',
        fetchedAt: daysAgo(2),
        itemCount: 3,
        status: 'success',
      },
      {
        id: CATALOGUE_STALE,
        retailer: 'woolworths',
        sourceType: 'web',
        sourceLabel: `${NS}-stale`,
        sourceUrl: 'https://example.test/stale',
        fetchedAt: daysAgo(30),
        itemCount: 1,
        status: 'success',
      },
    ]);

    const base = {
      sourceType: 'web',
      productName: `${NS} choc block 180g`,
      multiBuy: false,
      isMemberLocked: false,
    };
    await db.insert(specials).values([
      // Current, dated, NSW-tagged, cheaper — should win for coles.
      {
        ...base,
        catalogueId: CATALOGUE_FRESH,
        retailerSkuId: SKU_COLES,
        retailer: 'coles',
        sourceLabel: `${NS}-fresh`,
        retailerSku: `${NS}-c1-a`,
        specialPrice: '4.00',
        promoType: 'half_price',
        state: 'NSW',
        validFrom: isoDate(daysAgo(3)),
        validTo: isoDate(daysAgo(-4)),
      },
      // Current but dearer — must lose the distinct-on race.
      {
        ...base,
        catalogueId: CATALOGUE_FRESH,
        retailerSkuId: SKU_COLES,
        retailer: 'coles',
        sourceLabel: `${NS}-fresh`,
        retailerSku: `${NS}-c1-b`,
        specialPrice: '5.50',
        promoType: 'standard',
        validFrom: isoDate(daysAgo(3)),
        validTo: isoDate(daysAgo(-4)),
      },
      // Expired — excluded.
      {
        ...base,
        catalogueId: CATALOGUE_FRESH,
        retailerSkuId: SKU_COLES,
        retailer: 'coles',
        sourceLabel: `${NS}-fresh`,
        retailerSku: `${NS}-c1-c`,
        specialPrice: '0.50',
        promoType: 'half_price',
        validFrom: isoDate(daysAgo(20)),
        validTo: isoDate(daysAgo(8)),
      },
      // Undated on a stale catalogue — excluded by OFFER_MAX_AGE_DAYS.
      {
        ...base,
        catalogueId: CATALOGUE_STALE,
        retailerSkuId: SKU_WOOLIES,
        retailer: 'woolworths',
        sourceLabel: `${NS}-stale`,
        retailerSku: `${NS}-w1-a`,
        specialPrice: '1.00',
        promoType: 'prices_dropped',
      },
    ]);

    await db
      .insert(zones)
      .values({ postcode: TEST_POSTCODE, state: 'NT', suburb: `${NS}-suburb` })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(specials).where(inArray(specials.retailerSkuId, [SKU_COLES, SKU_WOOLIES]));
    await db.delete(catalogues).where(inArray(catalogues.id, [CATALOGUE_FRESH, CATALOGUE_STALE]));
    await db.delete(retailerSkus).where(inArray(retailerSkus.id, [SKU_COLES, SKU_WOOLIES]));
    await db.delete(canonicalProducts).where(inArray(canonicalProducts.id, [PRODUCT_ID]));
    await db.delete(zones).where(inArray(zones.postcode, [TEST_POSTCODE]));
    await sqlClient.end();
  });

  it('returns the cheapest current offer and excludes expired/stale rows', async () => {
    const offers = await loadOffersForCanonicalIds(db, [PRODUCT_ID], { state: 'NSW' });
    const entry = offers.get(PRODUCT_ID);
    expect(entry).toBeDefined();
    expect(entry!.coles?.specialPrice).toBe(4);
    expect(entry!.coles?.promoType).toBe('half_price');
    // The woolworths special is undated and its catalogue is 30 days old.
    expect(entry!.woolworths).toBeNull();
  });

  it('excludes offers tagged with a different state', async () => {
    const offers = await loadOffersForCanonicalIds(db, [PRODUCT_ID], { state: 'WA' });
    // NSW-tagged 4.00 excluded; untagged 5.50 remains.
    expect(offers.get(PRODUCT_ID)?.coles?.specialPrice).toBe(5.5);
  });

  it('uses only offers without a state restriction when no state is known', async () => {
    const offers = await loadOffersForCanonicalIds(db, [PRODUCT_ID]);
    expect(offers.get(PRODUCT_ID)?.coles?.specialPrice).toBe(5.5);
  });

  it('resolves postcode to state via zones', async () => {
    expect(await resolveStateForPostcode(db, TEST_POSTCODE)).toBe('NT');
    expect(await resolveStateForPostcode(db, '0000')).toBeNull();
  });
});
