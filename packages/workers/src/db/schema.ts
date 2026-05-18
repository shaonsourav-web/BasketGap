// Hand-written from live DB introspection on 2026-05-17.
// Supabase migrations under /supabase/migrations remain the source of truth.
// Re-sync this file after any migration: see docs/decisions.md.

import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value) as number[];
  },
});

export const canonicalProducts = pgTable('canonical_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  brand: text('brand'),
  category: text('category'),
  unitSizeValue: numeric('unit_size_value'),
  unitSizeUom: text('unit_size_uom'),
  description: text('description'),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogues = pgTable('catalogues', {
  id: uuid('id').primaryKey().defaultRandom(),
  retailer: text('retailer').notNull(),
  sourceType: text('source_type').notNull(),
  sourceLabel: text('source_label').notNull(),
  state: text('state'),
  sourceUrl: text('source_url').notNull(),
  sourceHash: text('source_hash'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  itemCount: integer('item_count').notNull().default(0),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const retailerSkus = pgTable(
  'retailer_skus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    retailer: text('retailer').notNull(),
    retailerSku: text('retailer_sku').notNull(),
    canonicalProductId: uuid('canonical_product_id').references(() => canonicalProducts.id, {
      onDelete: 'set null',
    }),
    lastSeenName: text('last_seen_name'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    matchConfidence: numeric('match_confidence', { precision: 3, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    retailerSkuUnique: unique('retailer_skus_retailer_sku_unique').on(
      table.retailer,
      table.retailerSku,
    ),
  }),
);

export const specials = pgTable(
  'specials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogueId: uuid('catalogue_id')
      .notNull()
      .references(() => catalogues.id, { onDelete: 'cascade' }),
    retailerSkuId: uuid('retailer_sku_id').references(() => retailerSkus.id, {
      onDelete: 'set null',
    }),
    retailer: text('retailer').notNull(),
    sourceType: text('source_type').notNull(),
    sourceLabel: text('source_label').notNull(),
    state: text('state'),
    retailerSku: text('retailer_sku'),
    productName: text('product_name').notNull(),
    brand: text('brand'),
    sizeText: text('size_text'),
    unitSizeValue: numeric('unit_size_value'),
    unitSizeUom: text('unit_size_uom'),
    regularPrice: numeric('regular_price', { precision: 10, scale: 2 }),
    specialPrice: numeric('special_price', { precision: 10, scale: 2 }).notNull(),
    savingsAmount: numeric('savings_amount', { precision: 10, scale: 2 }),
    savingsPercent: numeric('savings_percent', { precision: 5, scale: 2 }),
    unitPriceValue: numeric('unit_price_value', { precision: 10, scale: 4 }),
    unitPriceUom: text('unit_price_uom'),
    promoType: text('promo_type').notNull().default('standard'),
    promoLabel: text('promo_label'),
    multiBuy: boolean('multi_buy').notNull().default(false),
    isMemberLocked: boolean('is_member_locked').notNull().default(false),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    imageUrl: text('image_url'),
    sourcePage: integer('source_page'),
    rawText: text('raw_text'),
    rawPayload: jsonb('raw_payload'),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Partial unique — enforced only where retailer_sku is set. See migration
    // 20260518000000_round3_specials_unique.sql.
    catalogueRetailerSkuUnique: uniqueIndex('specials_catalogue_retailer_sku_unique')
      .on(table.catalogueId, table.retailerSku)
      .where(sql`retailer_sku is not null`),
  }),
);

export const priceObservations = pgTable('price_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  retailerSkuId: uuid('retailer_sku_id')
    .notNull()
    .references(() => retailerSkus.id, { onDelete: 'cascade' }),
  catalogueId: uuid('catalogue_id').references(() => catalogues.id, { onDelete: 'set null' }),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  state: text('state'),
  regularPrice: numeric('regular_price', { precision: 10, scale: 2 }),
  specialPrice: numeric('special_price', { precision: 10, scale: 2 }),
  isPromo: boolean('is_promo').notNull().default(false),
  promoType: text('promo_type'),
  sourceSpecialId: uuid('source_special_id').references(() => specials.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const zones = pgTable('zones', {
  postcode: text('postcode').primaryKey(),
  state: text('state').notNull(),
  suburb: text('suburb'),
  colesStoreId: text('coles_store_id'),
  woolworthsCatalogueState: text('woolworths_catalogue_state'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// `sql` is re-exported so future query files can use raw fragments without re-importing.
export { sql };
