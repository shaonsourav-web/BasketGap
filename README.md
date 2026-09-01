# BasketGap

A guest-first grocery list comparison app for Australia.
Type your shopping list, see what it costs at Coles vs Woolworths.

## Status

All four retailer adapters shipped — `workers ingest coles-pdf | woolies-pdf | coles-web | woolies-web [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]`. The PDF adapters parse each retailer's weekly catalogue; the web adapters render the retailer specials pages via Playwright headless Chromium — Coles parsed with cheerio, Woolies extracted in-page from `[tile-selector]` open shadow roots (cheerio only for fixtures). All persist into the same `catalogues` + `specials` tables under the right `(retailer, source_type)` discriminator, idempotent on `source_hash`. Cron workflows: weekly Wednesday morning (Sydney) for all four — the two web crons are expected-to-be-blocked from CI and stay green on a bot wall; the supported weekly path for web specials is the owner capture runbook at `packages/workers/scripts/CAPTURE.md` (see `docs/ingest-cadence.md`). Live source URLs are set via repo Variables `CATALOGUE_URL_COLES`, `CATALOGUE_URL_WOOLIES`, `CATALOGUE_URL_COLES_WEB`, `CATALOGUE_URL_WOOLIES_WEB`.

Matching engine shipped — `workers match --line "<text>" | --list <file>|-`, `workers seed canonical [--dry-run] [--force-refresh]`, `workers enrich-skus [--retailer coles|woolies] [--limit N] [--dry-run]`. The deterministic-first pipeline runs clean → spell-correct → shorthand (n-gram, Aussie slang) → quantity/size extraction → trigram direct lookup (`pg_trgm`) → vector search (pgvector cosine, Gemini `gemini-embedding-001` at 1536 dims, L2-normalised) → weighted-sum ranker with exact-match boosts → LLM disambiguation fallback (Gemini `gemini-2.5-flash`, schema-constrained output: the model must pick from the shortlist or decline) → postcode-independent `match_cache`. Confidence bands: `matched ≥ 0.80`, `assumed ≥ 0.55`, `needs_attention < 0.55`. Both tiers run off a single `GEMINI_API_KEY`. The pipeline degrades cleanly: no key → trigram-only **and** rank-only, i.e. fully offline deterministic matching. Audit trail records every step with per-step latency.

The shared matching package, Hono API package, and Vercel adapter are built and green locally. `POST /api/match` accepts 1–100 shopping-list lines, applies request IDs, body limits, rate limiting, CORS, per-request LLM caps, and returns match metadata. Run it with `pnpm --filter @basketgap/api dev` (Vercel) or `pnpm --filter @basketgap/api dev:node` (standalone Node). The offline eval harness currently scores **99.5% overall accuracy on 200 labelled lines**, with one documented false negative; run it with `pnpm --filter @basketgap/shared test:eval`. The real accuracy gate is the three independent blind gold sets in `packages/shared/src/matching/__tests__/eval/blind/` — **0 wrong picks** across all three; run one with `pnpm exec tsx scripts/blind-eval.ts <set>` from `packages/shared`. A local browser playground is available through `pnpm --filter @basketgap/shared playground`.

Production is **not ready yet**: the API identifies canonical products but does not yet join and return current Coles/Woolworths price observations. The live database must also be seeded, ingested, and enriched; production secrets, Upstash behavior, deployment, and the seven local commits still need explicit owner-controlled completion. See [workspace cleanup plan](./docs/workspace-cleanup-plan.md).

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
- [Workspace cleanup plan](./docs/workspace-cleanup-plan.md)
