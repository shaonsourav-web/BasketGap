# Architecture

A short map of how BasketGap is put together. It describes what the code does today; for the reasoning behind choices, see [decisions.md](./decisions.md), and for what is planned, see [ROADMAP.md](./ROADMAP.md). The original specification is [BasketGap.md](../BasketGap.md).

## Packages

This is a pnpm workspace (Node 24, pnpm 11).

| Package               | Role                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`     | The core library. Database schema (Drizzle), the matching engine (`src/matching/`), offers lookup (`src/pricing/`), environment parsing, the offline eval harness (`src/matching/__tests__/eval/`) and a local browser playground. |
| `packages/api`        | Hono app serving `POST /api/match` and `GET /api/health`, with Vercel and plain Node adapters. Depends on `shared`.                                                                                                                |
| `packages/workers`    | Command-line tools: catalogue ingestion for Coles and Woolworths, canonical product seeding, SKU enrichment, a `match` command and match-cache pruning. Depends on `shared`.                                                       |
| `packages/mobile`     | Expo / React Native app. Runs on a deterministic offline mock; it does not call the API yet.                                                                                                                                       |
| `supabase/migrations` | SQL migrations for the Postgres database (`pg_trgm` and pgvector are used by the matching queries).                                                                                                                                |

## Data flow

```
catalogue sources ──ingest──▶ specials ──enrich──▶ linked to canonical products
                                                             │
shopping list ─▶ API ─▶ matching pipeline ─▶ canonical product ids ─▶ offers lookup ─▶ response
```

Ingestion and matching are separate paths that meet in the database. The workers load published catalogue specials into `catalogues` and `specials`; the enrichment step links specials to canonical products; the API looks up current offers for the products a list matched.

### The matching pipeline

Implemented in `packages/shared/src/matching/pipeline.ts`. Each line of a shopping list is processed on its own, deterministic steps first:

1. **Normalise.** Clean the text (case, punctuation, units), spell-correct against a grocery vocabulary, expand shorthand and Aussie slang, and extract quantity and size. Steps `01` to `04` in `src/matching/steps/`.
2. **Cache read.** The cleaned line, size and quantity form a key. A cached match that is not `needs_attention` is returned straight away.
3. **Candidate retrieval.**
   - Trigram lookup of canonical product names in Postgres (`pg_trgm`), with the brand extracted from the line as an extra signal.
   - Optional vector search (pgvector cosine distance) when an embeddings key is configured.
4. **Deterministic ranking.** A weighted score combines text similarity (0.35), vector similarity (0.30), size match (0.15), brand match (0.10) and popularity (0.10), with caps for contradictions, such as a stated size or product form the candidate does not match. Weights are in `RANK_WEIGHTS` in `src/matching/types.ts`. Without embeddings the vector term is simply absent.
5. **Optional LLM fallback.** Only if the top score is below the `assumed` threshold, and only if an LLM key is configured. The model is shown the cleaned line and a shortlist and must return a shortlist id or decline. The response is constrained by a strict JSON schema, and the pipeline rejects any id not in the shortlist.
6. **Confidence band.**

   | Score         | Band              |
   | ------------- | ----------------- |
   | 0.80 or above | `matched`         |
   | 0.55 or above | `assumed`         |
   | below 0.55    | `needs_attention` |

   A bare generic word that was resolved to a documented default variant (for example "coffee") is capped at `assumed` even if its score would reach `matched`. A `needs_attention` line carries no product id.

7. **Cache write** for any result that is not `needs_attention`. The result includes an audit trail with each step's name and duration.

### Offers

After matching, `POST /api/match` looks up current retailer offers for the matched products, optionally narrowed to the state resolved from the request's postcode. If that query fails, offers come back as `null` and `stats.offers_available` is `false`; the matches are still returned. Offers come from ingested catalogue specials and carry their source label, validity window and fetch time. Offers with no explicit validity window are kept only while their catalogue is at most 14 days old.

## Providers

Both are optional and independent. The engine never requires either one.

| Setting          | Used for                                                                                                        | Without it                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `GEMINI_API_KEY` | Embeddings (`gemini-embedding-001`, 1536 dimensions, L2-normalised) for vector search, and for seeding vectors. | No vector search: trigram-only candidates.    |
| `OPENAI_API_KEY` | The LLM fallback (default model set by `OPENAI_LLM_MODEL`) that picks from a shortlist or declines.             | No LLM fallback: the deterministic rank only. |

With neither key set, the pipeline makes no network calls to either provider and is fully deterministic. That is the configuration CI and the eval harness use. Keys are read on the server only; the mobile app does not hold any.

## Privacy stance

What the code and [ios-approval-and-security.md](./ios-approval-and-security.md) establish:

- **Shopping lists are not stored as lists.** The API does not write the request body anywhere, and the request log records the method, path, status, request ID, latency and two hashes, not the lines.
- **The match cache stores cleaned single lines, not baskets.** A cache row holds the hash of the cleaned line, the cleaned text itself (at most 256 characters, enforced by a database constraint), the matched product id, band and alternatives, a hit count and a last-used time. It holds no postcode, device id or user id, and it is shared across all users. Rows unused for 90 days are pruned, and the table is capped at 200,000 rows. A line a shopper types can therefore live in the cache in cleaned form for up to that period. The security doc says rare or personal phrases should be avoided in the cache; that requirement is not separately enforced in code.
- **What providers receive.** Embeddings: the cleaned line. LLM fallback: the cleaned line and the candidate shortlist (ids, names, brands, sizes). No postcode, device id or basket is included in either request.
- **OpenAI requests set `store: false`**, so the Responses API does not retain the response for later retrieval. This is a request-level setting; it does not by itself describe OpenAI's other data handling, which this repository does not document. Check OpenAI's current terms for that.
- **Identifiers in logs are hashed.** The client IP and the optional `x-device-id` header are hashed with a salt that is the current UTC date and truncated to 16 hex characters before they are logged. This limits casual exposure; it is not strong anonymisation, because the salt is not secret.
- **Not verified here:** what the optional Sentry integration attaches to an event beyond the request ID tag, and the retention behaviour of the Google embeddings endpoint. The security doc lists the intended controls as requirements and a pre-launch checklist, some of which are still unchecked.

The doc also still mentions OpenRouter in places; the code does not use it. That is tracked as a starter task in [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md).

## Rate limiting and request limits

- `POST /api/match` is rate-limited with a sliding window (30 requests per 60 seconds by default) in Upstash Redis, keyed on the hash of the client IP alone. A client-supplied device id is not part of the key, because a caller could rotate it to escape the limit.
- The client IP is taken in a fixed order: `x-vercel-forwarded-for`, then `x-real-ip`, then the first entry of `x-forwarded-for`.
- **It fails closed in production.** When `VERCEL_ENV` or `NODE_ENV` is `production` and no limiter is configured, the endpoint answers `503` with code `RATE_LIMIT_UNAVAILABLE` rather than serving unlimited traffic. Preview and local development pass through without a limiter.
- Other limits: 1 to 100 lines per request, 200 characters per line, a 32 KB body, and a cap on LLM calls per request (`MAX_LLM_CALLS_PER_REQUEST`, default 10). Once the cap is reached, remaining lines resolve on the deterministic rank only.

Tests for these behaviours are in `packages/api/src/__tests__/`. Whether production is actually configured this way has not been verified.

## Where to look

| To understand...                | Read                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| The pipeline                    | `packages/shared/src/matching/pipeline.ts` and `steps/`                    |
| Provider clients                | `packages/shared/src/matching/lib/gemini.ts` and `openai.ts`               |
| Wiring of keys into the engine  | `packages/shared/src/matching/db.ts` (`createDbContext`)                   |
| The API surface                 | `packages/api/src/app.ts` and `routes/match.ts`                            |
| Rate limiting                   | `packages/api/src/middleware/rate-limit.ts`                                |
| Accuracy measurement            | `packages/shared/src/matching/__tests__/eval/` and `scripts/blind-eval.ts` |
| Ingestion cadence               | [ingest-cadence.md](./ingest-cadence.md)                                   |
| Why things are the way they are | [decisions.md](./decisions.md)                                             |
