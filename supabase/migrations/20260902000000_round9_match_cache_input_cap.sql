-- BasketGap — Round 9: bound match_cache.cleaned_input length.
-- The API already rejects basket lines longer than 200 chars (routes/match.ts),
-- and cleaning only ever shortens a line, so nothing legitimate can exceed 256.
-- This is a belt-and-braces guard so a future writer that bypasses the API
-- schema cannot turn the cache into unbounded text storage.
-- See docs/decisions.md (2026-09-02).

alter table public.match_cache
  add constraint match_cache_cleaned_input_len
  check (char_length(cleaned_input) <= 256);
