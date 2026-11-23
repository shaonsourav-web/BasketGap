import { sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';

import {
  OFFER_MAX_AGE_DAYS,
  RETAILERS,
  type LoadOffersOptions,
  type ProductOffers,
  type Retailer,
  type RetailerOffer,
} from './types.ts';

type OfferRow = {
  canonical_product_id: string;
  retailer: string;
  special_price: string;
  regular_price: string | null;
  savings_amount: string | null;
  savings_percent: string | null;
  promo_type: string;
  promo_label: string | null;
  multi_buy: boolean;
  is_member_locked: boolean;
  product_name: string;
  size_text: string | null;
  state: string | null;
  source_label: string;
  valid_to: string | null;
  fetched_at: string;
};

/**
 * Load the current best offer per retailer for each canonical product.
 *
 * "Current" means: the offer's valid_from/valid_to window covers today, or —
 * when the catalogue printed no window — its source was fetched within
 * OFFER_MAX_AGE_DAYS. "Best" means lowest special price, ties broken by the
 * most recently fetched catalogue.
 */
export async function loadOffersForCanonicalIds(
  db: Db,
  canonicalProductIds: string[],
  options: LoadOffersOptions = {},
): Promise<Map<string, ProductOffers>> {
  const ids = [...new Set(canonicalProductIds)].filter(Boolean);
  const result = new Map<string, ProductOffers>();
  if (ids.length === 0) return result;

  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const state = options.state ?? null;
  // Postgres array literal — a JS array param serializes as a scalar here,
  // same workaround as the vector literal in matching/db.ts.
  const idsLiteral = `{${ids.join(',')}}`;

  const rows = await db.execute<OfferRow>(sql`
    select distinct on (rs.canonical_product_id, s.retailer)
           rs.canonical_product_id,
           s.retailer,
           s.special_price::text as special_price,
           s.regular_price::text as regular_price,
           s.savings_amount::text as savings_amount,
           s.savings_percent::text as savings_percent,
           s.promo_type,
           s.promo_label,
           s.multi_buy,
           s.is_member_locked,
           s.product_name,
           s.size_text,
           s.state,
           s.source_label,
           s.valid_to::text as valid_to,
           c.fetched_at::text as fetched_at
    from public.specials s
    join public.retailer_skus rs on rs.id = s.retailer_sku_id
    join public.catalogues c on c.id = s.catalogue_id
    where rs.canonical_product_id = any(${idsLiteral}::uuid[])
      and (s.valid_from is null or s.valid_from <= ${today}::date)
      and (
        s.valid_to >= ${today}::date
        or (s.valid_to is null
            and c.fetched_at >= ${today}::date - make_interval(days => ${OFFER_MAX_AGE_DAYS}))
      )
      and (s.state is null or s.state = ${state}::text)
    order by rs.canonical_product_id, s.retailer, s.special_price asc, c.fetched_at desc
  `);

  for (const row of rows) {
    const retailer = row.retailer as Retailer;
    if (!RETAILERS.includes(retailer)) continue;
    const entry = result.get(row.canonical_product_id) ?? {
      canonicalProductId: row.canonical_product_id,
      coles: null,
      woolworths: null,
    };
    entry[retailer] = mapOffer(row, retailer);
    result.set(row.canonical_product_id, entry);
  }
  return result;
}

/** Resolve a 4-digit AU postcode to its state via the zones table. */
export async function resolveStateForPostcode(db: Db, postcode: string): Promise<string | null> {
  const rows = await db.execute<{ state: string }>(sql`
    select state from public.zones where postcode = ${postcode} limit 1
  `);
  return rows[0]?.state ?? null;
}

function mapOffer(row: OfferRow, retailer: Retailer): RetailerOffer {
  return {
    retailer,
    specialPrice: Number.parseFloat(row.special_price),
    regularPrice: row.regular_price != null ? Number.parseFloat(row.regular_price) : null,
    savingsAmount: row.savings_amount != null ? Number.parseFloat(row.savings_amount) : null,
    savingsPercent: row.savings_percent != null ? Number.parseFloat(row.savings_percent) : null,
    promoType: row.promo_type,
    promoLabel: row.promo_label,
    multiBuy: row.multi_buy,
    memberLocked: row.is_member_locked,
    productName: row.product_name,
    sizeText: row.size_text,
    state: row.state,
    sourceLabel: row.source_label,
    validTo: row.valid_to,
    fetchedAt: new Date(row.fetched_at).toISOString(),
  };
}
