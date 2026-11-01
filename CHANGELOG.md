# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has releases. There are no tagged releases yet. Everything below is pre-release.

## [Unreleased]

### Added

- `LICENSE` (GNU Affero General Public License v3.0 only), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `SECURITY.md`, ahead of a public release.
- GitHub issue forms (bug report, feature request), a pull request template, and a Dependabot configuration for npm and GitHub Actions dependencies.
- `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` and `docs/GOOD_FIRST_ISSUES.md`.
- OpenAI client for the optional LLM disambiguation fallback (`packages/shared/src/matching/lib/openai.ts`), using the Responses API with a strict JSON schema, `store: false` and a bounded output size. New optional settings: `OPENAI_API_KEY` and `OPENAI_LLM_MODEL`.
- `provider-matrix.test.ts`: runs the four combinations of the two optional keys through the real pipeline with a stubbed `fetch`, and asserts which provider hosts each combination contacts.

### Changed

- The LLM fallback moved from Gemini back to OpenAI. Embeddings stay on Gemini (`gemini-embedding-001` at 1536 dimensions), so no re-seed or migration is needed. `matching/lib/gemini.ts` is now embeddings-only. See the 2026-11-01 entry in `docs/decisions.md`.
- The two provider keys are independent again, giving four degradation states: neither key (fully offline, deterministic), Gemini only, OpenAI only, or both.

### Removed

- `GEMINI_LLM_MODEL`. A stale value left in an environment is ignored.

### Known issues

- Per-line LLM truncation reporting in `POST /api/match` is imprecise: a declined line can be flagged `truncated` when the request-wide LLM cap was reached later in the same request.
- `freshness()` in the mobile app labels any price older than today as "yesterday".
- `.5L`-style sizes, "half dozen" and an attached `mls` unit are mis-parsed or not parsed. See `docs/GOOD_FIRST_ISSUES.md` for reproductions.
- `docs/ios-approval-and-security.md` still refers to OpenRouter in several places.

## [0.1.0] - Unreleased (pre-release draft)

This section describes what exists in the repository today. It is a draft: no `v0.1.0` tag has been created and the root `package.json` still says `0.0.0`. Nothing here has been verified against a live production deployment.

### Added

- **Matching engine** (`packages/shared`). Deterministic-first pipeline: clean, spell-correct, shorthand and Aussie slang expansion, quantity and size extraction, trigram lookup (`pg_trgm`), optional vector search (pgvector, Gemini embeddings), a weighted ranker, an optional LLM fallback that can only choose from the shortlist or decline, and a postcode-independent match cache. Results carry a confidence band (`matched` at 0.80 or above, `assumed` at 0.55 or above, otherwise `needs_attention`) and a per-step audit trail. With no API keys the engine runs fully offline and deterministically.
- **Evaluation harness.** A 200-line labelled set (99.5% overall accuracy, one documented false negative) and three blind gold sets written by other models from the seed file only (426, 300 and 250 lines): 0 wrong picks on in-catalogue lines in all three, with correct-match rates of 99.5%, 98.3% and 98.0%. All are scored against the built-in 152-product staple catalogue, not a full retail catalogue. Run with `pnpm --filter @basketgap/shared test:eval` and `scripts/blind-eval.ts`.
- **Local playground** for the engine against the built-in catalogue (`pnpm --filter @basketgap/shared playground`).
- **API** (`packages/api`). Hono app with `POST /api/match` (1 to 100 lines of up to 200 characters, 32 KB body limit, request IDs, CORS allowlist, per-request cap on LLM calls, retailer offers attached to matched lines, postcode resolved to state) and `GET /api/health`. Vercel and plain Node adapters.
- **Rate limiting** through Upstash Redis, keyed on the client IP hash alone. In production the API responds `503` when no limiter is configured instead of serving unlimited traffic.
- **Workers** (`packages/workers`). The built-in `import` adapter (JSON or CSV), the adapter kit and plugin loader (`BASKETGAP_INGEST_PLUGINS`), a canonical product seed (152 products), SKU enrichment, a `match` command, and `prune-cache`. Retailer-specific adapters are not part of this repository; they live in a separate private plugin outside it, and this repository ships no retailer ingest schedule. See `docs/ingest-adapters.md` and `docs/ingest-cadence.md`.
- **Database** migrations for Supabase Postgres (`supabase/migrations`), including the match cache with a 256-character cap on cached input.
- **Match cache bounds**: entries older than 90 days are removed, and the table is capped at 200,000 rows by least recent use.
- **Mobile app** (`packages/mobile`): Expo and TypeScript, six screens covering the guest flow. It runs entirely on a deterministic offline mock with invented products and prices, and is not connected to the API.
- Continuous integration for lint, typecheck, test and format checks.
- Specification (`BasketGap.md`), decisions log (`docs/decisions.md`) and working notes in `docs/`.

### Known limitations

- Prices come from weekly catalogue promotions only. They are not full shelf prices, and not every product has a promotion.
- The mobile app is not connected to the API. Quantity handling, comparable totals and missing-price behaviour on live data are not yet implemented or verified.
- Production readiness is not established: live data freshness, deployment, provider spend limits and rate limiting in production have not been verified.
- Accuracy figures are measured on a 152-product catalogue and an in-memory approximation of Postgres trigram similarity. They do not predict accuracy on a larger real catalogue.
- No legal review of the retailer data sources is recorded in this repository.

[Unreleased]: https://github.com/shaonsourav-web/BasketGap/commits/main
