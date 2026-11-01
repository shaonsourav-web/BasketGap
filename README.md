# BasketGap

BasketGap is a free grocery list comparison app for Australia. You type or paste a shopping list, and it shows what that list costs at Coles and at Woolworths, using the prices and promotions published in each retailer's catalogue. It states both totals and the difference between them. It does not tell you where to shop.

## Status

Early development. It is not a finished product.

- The matching engine, the ingestion workers, and the API are built and pass their checks locally.
- The mobile app (`packages/mobile`) runs in the iOS Simulator, but every figure it shows comes from a built-in offline mock. It is not connected to the API yet.
- Production readiness has not been established. No live deployment has been verified.
- Prices come from weekly catalogue promotions only. They are not full shelf prices, and not every product has a promotion.

The detailed, per-feature status is further down under [Status in detail](#status-in-detail).

## How it works

Each line of your list goes through a pipeline that tries deterministic steps first and only asks a language model for help when those are not confident enough:

1. Clean the text, fix spelling, and expand shorthand and Aussie slang.
2. Pull out quantities and sizes.
3. Look the line up by trigram similarity in Postgres.
4. Optionally search by embedding similarity (needs a Gemini key).
5. Rank the candidates with a weighted score.
6. Optionally ask a language model to choose from the shortlist, or decline (needs an OpenAI key).
7. Cache the result.

Each match is labelled `matched`, `assumed` or `needs_attention`, so lines the engine is unsure about are shown as such rather than guessed. With no keys at all, the engine still runs, using only the deterministic steps.

## Repository layout

This is a pnpm workspace.

| Package               | What it is                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`     | Database schema, the matching engine, the offline evaluation harness, and a local browser playground.                                   |
| `packages/workers`    | Command-line tools: catalogue ingestion (built-in file import plus optional external plugins), canonical product seeding, and matching. |
| `packages/api`        | A Hono API (`POST /api/match`) with Vercel and plain Node adapters.                                                                     |
| `packages/mobile`     | The Expo / React Native app, currently running on offline mock data.                                                                    |
| `supabase/migrations` | SQL migrations for the Postgres database.                                                                                               |
| `docs/`               | Design decisions and working notes. Start with [docs/decisions.md](./docs/decisions.md).                                                |

The full product specification is in [BasketGap.md](./BasketGap.md).

## Run it offline with no keys

You need Node 24 (see `.nvmrc`) and pnpm 11 (pinned through Corepack). No API keys, database or network access are needed for the commands below.

```bash
corepack enable
pnpm install
```

Run the matching engine against a small built-in catalogue in the browser:

```bash
pnpm --filter @basketgap/shared playground
# then open http://localhost:8787
```

Score the engine against the labelled evaluation set:

```bash
pnpm --filter @basketgap/shared test:eval
```

Score it against one of the blind gold sets:

```bash
cd packages/shared
pnpm exec tsx scripts/blind-eval.ts src/matching/__tests__/eval/blind/gold-opus-2026-09-01.json
```

Parse a synthetic specials file without writing to any database:

```bash
pnpm --filter @basketgap/workers exec tsx src/cli.ts ingest import \
  --file examples/import/specials.example.csv --dry-run
```

Run the full check suite:

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

Run the mobile app on mock data (needs Xcode and the iOS Simulator):

```bash
pnpm --filter @basketgap/mobile ios
```

Notes:

- `workers match`, `workers seed canonical` and `workers enrich-skus` read products from Postgres, so they need `DATABASE_URL`. The offline matching route is the playground and the evaluation scripts above, which use an in-memory catalogue.
- The package scripts `workers ingest`, `workers match` and similar load `.env.local` from the repository root and fail if that file does not exist. Create it from `.env.example`, or call `tsx src/cli.ts ...` through `pnpm --filter @basketgap/workers exec` as shown above.

## Optional keys and services

Copy `.env.example` to `.env.local` and fill in only what you need. Everything here is optional for the offline route above.

| Variable                                         | What it enables                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                                 | Embeddings (`gemini-embedding-001`) for vector search. Without it the engine uses trigram matching only.    |
| `OPENAI_API_KEY`                                 | The language-model fallback that picks from a shortlist. Without it the engine uses ranking only.           |
| `UPSTASH_REDIS_REST_URL`, `..._TOKEN`            | Upstash Redis for API rate limiting. In production the API fails closed if rate limiting is not configured. |
| `DATABASE_URL` (and the other Supabase settings) | A Supabase Postgres database for ingestion, the canonical catalogue, the match cache and the API.           |
| `SENTRY_DSN`, `SENTRY_DSN_API`                   | Error reporting. Without them errors go to stderr.                                                          |

Never commit `.env.local` or any real key.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first. Note the rule that no retailer content, screenshots, catalogue PDFs or real price dumps may be contributed. Test data must be synthetic. This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](./SECURITY.md).

## Licence

BasketGap is licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`). See [LICENSE](./LICENSE). If you run a modified version as a network service, the AGPL requires you to offer its source to the people who use it.

## Disclaimer

BasketGap is not affiliated with, endorsed by or sponsored by Coles Group or Woolworths Group. The names Coles and Woolworths are used only to identify the retailers whose published catalogue prices are compared. Prices and promotions may be out of date or incomplete. Verify at the shelf.

## Status in detail

Ingestion ships one built-in adapter, `import` — `workers ingest import --file <specials.json|specials.csv> [--dry-run] [--force-refresh]` — which reads a local file in a documented format (see `docs/ingest-adapters.md`) and never touches the network. Retailer-specific adapters are optional and live outside this repository; they are loaded at runtime through the `BASKETGAP_INGEST_PLUGINS` environment variable. Everything persists into the same `catalogues` + `specials` tables under the right `(retailer, source_type)` discriminator, idempotent on `source_hash`. Refresh rhythm and the 14-day freshness window are described in `docs/ingest-cadence.md`.

Matching engine shipped — `workers match --line "<text>" | --list <file>|-`, `workers seed canonical [--dry-run] [--force-refresh]`, `workers enrich-skus [--retailer coles|woolies] [--limit N] [--dry-run]`. The deterministic-first pipeline runs clean → spell-correct → shorthand (n-gram, Aussie slang) → quantity/size extraction → trigram direct lookup (`pg_trgm`) → vector search (pgvector cosine, Gemini `gemini-embedding-001` at 1536 dims, L2-normalised) → weighted-sum ranker with exact-match boosts → LLM disambiguation fallback (OpenAI `gpt-6-luna` via the Responses API, strict JSON-schema output: the model must pick from the shortlist or decline) → postcode-independent `match_cache`. Confidence bands: `matched ≥ 0.80`, `assumed ≥ 0.55`, `needs_attention < 0.55`. Each tier has its own optional key — `GEMINI_API_KEY` for embeddings, `OPENAI_API_KEY` for the LLM fallback — and either runs without the other. The pipeline degrades cleanly: no Gemini key → trigram-only, no OpenAI key → rank-only, neither → fully offline deterministic matching. Audit trail records every step with per-step latency. `match_cache` is growth-bounded: `workers prune-cache [--max-age-days N] [--max-rows N]` (default 90 days / 200,000 rows) ages out cold entries and caps the table by least-recently-used, run weekly by the `Prune Match Cache` workflow.

The shared matching package, Hono API package, and Vercel adapter are built and green locally. `POST /api/match` accepts 1–100 shopping-list lines, applies request IDs, body limits, rate limiting, CORS, per-request LLM caps, and returns match metadata. Run it with `pnpm --filter @basketgap/api dev` (Vercel) or `pnpm --filter @basketgap/api dev:node` (standalone Node). The offline eval harness currently scores **99.5% overall accuracy on 200 labelled lines**, with one documented false negative; run it with `pnpm --filter @basketgap/shared test:eval`. The real accuracy gate is the three independent blind gold sets in `packages/shared/src/matching/__tests__/eval/blind/` — **0 wrong picks** across all three; run one with `pnpm exec tsx scripts/blind-eval.ts <set>` from `packages/shared`. A local browser playground is available through `pnpm --filter @basketgap/shared playground`.

The mobile app shell is up — `packages/mobile`, Expo SDK 57 + expo-router + TypeScript, six screens covering the whole guest flow: postcode → Notes-style list → dual totals with the factual difference and top 5 drivers → all items with confidence bands → split basket → a dismissible prompt for lines that couldn't be priced. It runs in the iOS Simulator today with `pnpm --filter @basketgap/mobile ios`. Every figure on screen comes from a deterministic offline mock in `src/mock/`. The API now returns retailer offers, but the mobile comparison flow is not connected to it yet. Shared types help integration; quantity handling, comparable totals, and missing-price behavior still need end-to-end verification. See [packages/mobile/README.md](./packages/mobile/README.md).

Production readiness is **not established by the local checks**. The API returns Coles/Woolworths offers and resolves postcode to state; production rate limiting fails closed. The remaining product boundary is the mobile-to-API comparison flow, including honest handling of missing and stale prices. Current live data and deployment state must be verified before launch. See [workspace cleanup review](./docs/workspace-cleanup-plan.md).

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
- [Workspace cleanup plan](./docs/workspace-cleanup-plan.md)
