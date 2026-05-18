# BasketGap

A guest-first grocery list comparison app for Australia.
Type your shopping list, see what it costs at Coles vs Woolworths.

## Status

All four retailer adapters shipped — `workers ingest coles-pdf | woolies-pdf | coles-web | woolies-web [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]`. The PDF adapters parse each retailer's weekly catalogue; the web adapters render the "Down Down" / "Prices Dropped" pages via Playwright headless Chromium and parse them with cheerio. All persist into the same `catalogues` + `specials` tables under the right `(retailer, source_type)` discriminator, idempotent on `source_hash`. Cron workflows: weekly Wednesday polling for PDFs, daily 06:00 AEST (Coles) and 06:30 AEST (Woolies) for the web adapters. Live source URLs are set via repo Variables `CATALOGUE_URL_COLES`, `CATALOGUE_URL_WOOLIES`, `CATALOGUE_URL_COLES_WEB`, `CATALOGUE_URL_WOOLIES_WEB`.

Matching engine shipped — `workers match --line "<text>" | --list <file>|-`, `workers seed canonical [--dry-run] [--force-refresh]`, `workers enrich-skus [--retailer coles|woolies] [--limit N] [--dry-run]`. The deterministic-first pipeline runs clean → spell-correct → shorthand (n-gram, Aussie slang) → quantity/size extraction → trigram direct lookup (pg_trgm) → vector search (pgvector cosine, OpenAI `text-embedding-3-small`) → weighted-sum ranker with exact-match boosts → LLM disambiguation fallback (OpenRouter `google/gemini-2.0-flash-001`, constrained-output: the model must pick from the shortlist or decline) → postcode-independent `match_cache`. Confidence bands: `matched ≥ 0.80`, `assumed ≥ 0.55`, `needs_attention < 0.55`. The pipeline degrades cleanly: no `OPENAI_API_KEY` → trigram-only; no `OPENROUTER_API_KEY` → rank-only; both absent → fully offline deterministic. Audit trail records every step with per-step latency.

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
