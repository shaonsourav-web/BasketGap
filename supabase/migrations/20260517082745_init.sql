-- BasketGap v1 — Round 1: initial schema
-- Six tables: zones, canonical_products, retailer_skus, catalogues, specials, price_observations
-- See docs/decisions.md for design rationale.
-- Supabase CLI wraps each migration in a transaction; explicit begin/commit omitted to avoid nesting.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy text search
create extension if not exists vector;     -- pgvector embeddings

-- ============================================================================
-- Trigger function: maintain updated_at
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- zones — postcode → retailer zone mapping
-- ============================================================================
create table public.zones (
  postcode text primary key,
  state text not null,
  suburb text null,
  coles_store_id text null,
  woolworths_catalogue_state text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zones_state_check check (state in ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT'))
);

create index zones_state_idx on public.zones (state);
create index zones_coles_store_id_idx on public.zones (coles_store_id) where coles_store_id is not null;

create trigger zones_set_updated_at
  before update on public.zones
  for each row execute function public.set_updated_at();

alter table public.zones enable row level security;

-- ============================================================================
-- canonical_products — one row per real product
-- ============================================================================
create table public.canonical_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text null,
  category text null,
  unit_size_value numeric null,
  unit_size_uom text null,
  description text null,
  embedding vector(1536) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index canonical_products_name_trgm_idx on public.canonical_products using gin (name gin_trgm_ops);
create index canonical_products_brand_idx on public.canonical_products (brand) where brand is not null;
create index canonical_products_category_idx on public.canonical_products (category) where category is not null;
create index canonical_products_embedding_ivfflat_idx
  on public.canonical_products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create trigger canonical_products_set_updated_at
  before update on public.canonical_products
  for each row execute function public.set_updated_at();

alter table public.canonical_products enable row level security;

-- ============================================================================
-- retailer_skus — bridge between retailer SKUs and canonical products
-- ============================================================================
create table public.retailer_skus (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  retailer_sku text not null,
  canonical_product_id uuid null references public.canonical_products(id) on delete set null,
  last_seen_name text null,
  last_seen_at timestamptz null,
  match_confidence numeric(3,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_skus_retailer_check check (retailer in ('coles','woolworths')),
  constraint retailer_skus_retailer_sku_unique unique (retailer, retailer_sku)
);

create index retailer_skus_canonical_product_id_idx on public.retailer_skus (canonical_product_id);
create index retailer_skus_retailer_last_seen_idx on public.retailer_skus (retailer, last_seen_at desc);

create trigger retailer_skus_set_updated_at
  before update on public.retailer_skus
  for each row execute function public.set_updated_at();

alter table public.retailer_skus enable row level security;

-- ============================================================================
-- catalogues — one row per ingestion attempt
-- ============================================================================
create table public.catalogues (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  source_type text not null,
  source_label text not null,
  state text null,
  source_url text not null,
  source_hash text null,
  fetched_at timestamptz not null default now(),
  valid_from date null,
  valid_to date null,
  item_count int not null default 0,
  status text not null,
  error_message text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogues_retailer_check check (retailer in ('coles','woolworths')),
  constraint catalogues_source_type_check check (source_type in ('pdf','web')),
  constraint catalogues_status_check check (status in ('success','partial','parse_failed','fetch_failed'))
);

create index catalogues_latest_by_source_idx on public.catalogues (retailer, source_label, state, fetched_at desc);
create unique index catalogues_source_hash_unique on public.catalogues (source_hash) where source_hash is not null;
create index catalogues_status_recent_idx on public.catalogues (status, fetched_at desc);

create trigger catalogues_set_updated_at
  before update on public.catalogues
  for each row execute function public.set_updated_at();

alter table public.catalogues enable row level security;

-- ============================================================================
-- specials — one row per parsed item
-- ============================================================================
create table public.specials (
  id uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references public.catalogues(id) on delete cascade,
  retailer_sku_id uuid null references public.retailer_skus(id) on delete set null,
  retailer text not null,
  source_type text not null,
  source_label text not null,
  state text null,
  retailer_sku text null,
  product_name text not null,
  brand text null,
  size_text text null,
  unit_size_value numeric null,
  unit_size_uom text null,
  regular_price numeric(10,2) null,
  special_price numeric(10,2) not null,
  savings_amount numeric(10,2) null,
  savings_percent numeric(5,2) null,
  unit_price_value numeric(10,4) null,
  unit_price_uom text null,
  promo_type text not null default 'standard',
  promo_label text null,
  multi_buy boolean not null default false,
  is_member_locked boolean not null default false,
  valid_from date null,
  valid_to date null,
  image_url text null,
  source_page int null,
  raw_text text null,
  raw_payload jsonb null,
  confidence_score numeric(3,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specials_promo_type_check check (promo_type in ('standard','half_price','down_down','prices_dropped','percent_off','multi_buy','unknown'))
);

create index specials_catalogue_id_idx on public.specials (catalogue_id);
create index specials_retailer_sku_id_idx on public.specials (retailer_sku_id) where retailer_sku_id is not null;
create index specials_current_by_zone_idx on public.specials (retailer, state, valid_to desc);
create index specials_current_by_source_idx on public.specials (retailer, source_label, valid_to desc);
create index specials_product_name_trgm_idx on public.specials using gin (product_name gin_trgm_ops);

create trigger specials_set_updated_at
  before update on public.specials
  for each row execute function public.set_updated_at();

alter table public.specials enable row level security;

-- ============================================================================
-- price_observations — append-only time-series of prices
-- (intentionally no updated_at trigger — rows are immutable observations)
-- ============================================================================
create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  retailer_sku_id uuid not null references public.retailer_skus(id) on delete cascade,
  catalogue_id uuid null references public.catalogues(id) on delete set null,
  observed_at timestamptz not null default now(),
  state text null,
  regular_price numeric(10,2) null,
  special_price numeric(10,2) null,
  is_promo boolean not null default false,
  promo_type text null,
  source_special_id uuid null references public.specials(id) on delete set null,
  created_at timestamptz not null default now()
);

create index price_observations_sku_observed_idx on public.price_observations (retailer_sku_id, observed_at desc);
create index price_observations_observed_at_idx on public.price_observations (observed_at desc);
create index price_observations_sku_promo_idx on public.price_observations (retailer_sku_id, is_promo, observed_at desc);

alter table public.price_observations enable row level security;
