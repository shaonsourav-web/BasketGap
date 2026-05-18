-- BasketGap Round 3: idempotency for specials ingestion.
-- Partial unique index — only enforced where retailer_sku is present.
-- catalogues already has `catalogues_source_hash_unique` (partial) from Round 1.

create unique index if not exists specials_catalogue_retailer_sku_unique
  on public.specials (catalogue_id, retailer_sku)
  where retailer_sku is not null;
