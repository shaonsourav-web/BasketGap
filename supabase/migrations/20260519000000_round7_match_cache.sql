-- BasketGap v1 — Round 7: match_cache
-- Per-cleaned-input cached match decision, postcode-independent.
-- See docs/decisions.md (2026-05-19 entries) for rationale.

create table public.match_cache (
  cleaned_input_hash text primary key,
  cleaned_input text not null,
  canonical_product_id uuid null references public.canonical_products(id) on delete set null,
  confidence_band text not null,
  alternatives jsonb not null default '[]'::jsonb,
  decided_by text not null,
  hit_count integer not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint match_cache_confidence_band_check
    check (confidence_band in ('matched','assumed','needs_attention')),
  constraint match_cache_decided_by_check
    check (decided_by in ('direct','vector','rank','llm','cache','none'))
);

create index match_cache_canonical_idx
  on public.match_cache (canonical_product_id)
  where canonical_product_id is not null;
create index match_cache_last_used_idx
  on public.match_cache (last_used_at desc);

alter table public.match_cache enable row level security;
