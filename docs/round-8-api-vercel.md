# BasketGap Round 8 — API package on Vercel Functions

## Context

Round 7 (commit `504fe80`, 2026-05-19) shipped the matching engine — a 9-step deterministic-first pipeline with constrained LLM fallback, currently only exposed via the `workers match` CLI. Round 8 surfaces this engine to the public via HTTP, hosted on Vercel Functions, ready for the eventual mobile app (Round 9+) to consume.

The security posture for public-facing surfaces is locked (`feedback_basketgap_security.md` in memory): keys never leave the server, the LLM is purpose-locked (must pick from shortlist or decline), every request is Zod-validated and rate-limited, no source/file/PII exposure. Round 8 implements that posture.

Repo state on entry: workers package complete with full matching pipeline; no `packages/api/`, no `packages/shared/`; Vercel account authorized (team `team_RL7l6U4gJrlPx1yP9gkfRPAx`), no BasketGap project on Vercel yet.

## Goal

Hand over a green API package: `packages/api/` deployed to Vercel production as `basketgap-api`, single `POST /api/match` endpoint accepting Zod-validated `{ lines, postcode? }` payload, rate-limited per `(ip, device_id)` via Upstash Redis, returning deterministic-first matches plus retailer price data. All secrets server-side via Vercel env vars; `.vercelignore` excludes source/docs/memory/migrations; CI runs api tests; CI green post-push.

## Decisions baked into this round

- **Framework: Hono on Vercel Functions** with the `hono/vercel` adapter. Catch-all `api/[[...route]].ts` mounts the Hono app at basePath `/api`. Middleware composition (CORS → request-id → request-log → rate-limit → error-handler) before route dispatch.
- **Surgical lift to `packages/shared/`**: moves `src/db/{client,schema}.ts`, `src/lib/{env,observability}.ts`, the entire `src/matching/` tree, and `drizzle.config.ts` + `drizzle-kit` dev dep. Workers retains CLIs (`cli.ts`, `commands/`) and ingestion adapters; everything else is re-imported via `@basketgap/shared`. API imports the same.
- **Rate limiting: Upstash Redis** via Vercel Marketplace. `@upstash/ratelimit` sliding-window — 30 requests per 60s per `(ip, device_id)` key. Final backstop is OpenAI + OpenRouter dashboard spending caps.
- **Endpoint shape**: single `POST /api/match` with `{ lines: string[1..100], postcode?: string }`. Returns `{ results: MatchResult[], stats: { cached: number, llm_calls: number, latency_ms: number, request_id: string } }`.
- **Auth strategy: none** (guest-first). Client supplies `X-Device-Id` header (UUID v4 it generates and persists locally). Rate-limit key is `(client_ip, device_id)`. Missing device-id is accepted but loses per-device fairness.
- **Input caps** (enforced before any DB/external call): each line ≤200 chars, ≤100 lines per request, total body ≤32 KB. LLM calls capped at 10 per request (env-overridable `MAX_LLM_CALLS_PER_REQUEST`).
- **CORS**: env-driven allowlist via `ALLOWED_ORIGINS` (CSV). Dev defaults to `http://localhost:*`. Missing env in prod → no CORS headers emitted (browser clients blocked; native mobile fetch unaffected).
- **Error responses**: sanitised. Schema is `{ error: { message: string, code: string, request_id: string } }`. 400 for validation, 401/403 (reserved), 429 for rate limit, 5xx for everything else. `X-Request-Id` header always emitted. Stack traces go to Sentry only; never to the wire.
- **Logging**: request log fields are `request_id`, `ip_hash` (daily-salted sha256), `device_id_hash`, `lines_count`, `latency_ms`, `cache_hits`, `llm_calls`, `status`. Never logs raw shopping text.
- **Vercel project**: `basketgap-api` in team `team_RL7l6U4gJrlPx1yP9gkfRPAx`. Hobby plan. `vercel.app` subdomain. Function region pinned to `syd1` (Sydney) since users are AU. Custom domain deferred.
- **`.vercelignore`** excludes: `.env*`, `*.sql`, `docs/`, `memory/`, `.dbpass`, `supabase/`, `apps/`, `packages/workers/`, `**/*.test.ts`, `**/__tests__/**`, `**/[local-tool-dir]/**`, anything `.gitignore` already lists.
- **Sentry**: API gets its own DSN env var (`SENTRY_DSN_API`); shared observability stays as the abstraction layer. Init runs once at function cold-start.
- **CI**: existing `.github/workflows/ci.yml` already runs `pnpm -r lint|typecheck|test`. API + shared packages pick up automatically. No new workflows this round; Vercel git integration handles deploys.

## Scaffold design (file by file)

### Root edits

| Path                  | Edit                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `.vercelignore`       | NEW — exclusions per security posture                                                                                      |
| `.env.example`        | Add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALLOWED_ORIGINS`, `SENTRY_DSN_API`, `MAX_LLM_CALLS_PER_REQUEST` |
| `docs/decisions.md`   | Append Round 8 entries (dated 2026-05-19)                                                                                  |
| `README.md`           | Status: API package shipped to Vercel                                                                                      |
| `pnpm-workspace.yaml` | No change — `packages/*` covers new packages                                                                               |

### `packages/shared/` (NEW)

| Path                       | Purpose                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`             | `@basketgap/shared`, `type: module`, exports map for `./db`, `./db/schema`, `./lib/env`, `./lib/observability`, `./matching`, `./matching/types`. Runtime deps: `drizzle-orm`, `postgres`, `zod`. Dev deps: `drizzle-kit`, `typescript`, `vitest` |
| `tsconfig.json`            | Extends base, `rootDir: src`                                                                                                                                                                                                                      |
| `drizzle.config.ts`        | Moved from workers; outputs to `src/db/schema.ts`                                                                                                                                                                                                 |
| `src/db/client.ts`         | Moved from workers; `createClient(databaseUrl)` signature unchanged                                                                                                                                                                               |
| `src/db/schema.ts`         | Moved from workers (drizzle-introspected)                                                                                                                                                                                                         |
| `src/lib/env.ts`           | Moved from workers — exports `BaseEnvSchema` + generic `loadEnv<T>(schema)` so each package extends with its own keys                                                                                                                             |
| `src/lib/observability.ts` | Moved from workers                                                                                                                                                                                                                                |
| `src/matching/**`          | Entire tree moved: `pipeline.ts`, `types.ts`, `db.ts`, `dictionaries/`, `lib/`, `steps/`, `seed/`, all `__tests__/`                                                                                                                               |
| `src/index.ts`             | Re-exports public surface                                                                                                                                                                                                                         |

### `packages/workers/` (MODIFIED)

- Internal imports of moved files → `@basketgap/shared/...`
- `package.json`: add `"@basketgap/shared": "workspace:*"`; drop `drizzle-orm`, `postgres`, `zod`, `drizzle-kit` (now transitive via shared)
- Delete moved files
- Keep: `cli.ts`, `commands/{ping,ingest,match,enrich-skus,seed-canonical}.ts`, `adapters/`, `lib/env.ts` if it still has worker-specific keys (else delete and import from shared)
- `db:pull` script: update path to `../../packages/shared` or move script to shared

### `packages/api/` (NEW)

| Path                               | Purpose                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                     | `@basketgap/api`, `type: module`. Runtime deps: `hono`, `@hono/zod-validator`, `@upstash/redis`, `@upstash/ratelimit`, `@sentry/node`, `@basketgap/shared` (workspace). Dev: `vitest`, `typescript`, `tsx`, `@types/node`, `vercel` (CLI) |
| `tsconfig.json`                    | Extends base, `rootDir: src`, includes `api/` for the Vercel entry                                                                                                                                                                        |
| `vercel.json`                      | `framework: null`, `regions: ["syd1"]`, install/build commands, function runtime memory/timeout                                                                                                                                           |
| `api/[[...route]].ts`              | Vercel function entry; imports Hono app, calls `handle(app)`                                                                                                                                                                              |
| `src/app.ts`                       | Hono app with middleware chain + `/match` route mount                                                                                                                                                                                     |
| `src/routes/match.ts`              | POST handler — Zod validate → input caps → cache check → matching pipeline → response shape                                                                                                                                               |
| `src/middleware/cors.ts`           | Origin allowlist from env                                                                                                                                                                                                                 |
| `src/middleware/request-id.ts`     | Generates UUID per request, sets `X-Request-Id` header, attaches to context                                                                                                                                                               |
| `src/middleware/request-log.ts`    | Structured log; PII-safe                                                                                                                                                                                                                  |
| `src/middleware/rate-limit.ts`     | Upstash sliding window keyed on `(ip, device_id)`                                                                                                                                                                                         |
| `src/middleware/error-handler.ts`  | Sanitised JSON errors                                                                                                                                                                                                                     |
| `src/lib/env.ts`                   | API-specific env, extends shared `BaseEnvSchema`                                                                                                                                                                                          |
| `src/lib/hash.ts`                  | Daily-rotated salt sha256 for IPs/device IDs                                                                                                                                                                                              |
| `src/lib/sentry.ts`                | One-time `Sentry.init` guarded by global flag                                                                                                                                                                                             |
| `src/__tests__/match.test.ts`      | Endpoint tests with mocked DB/Upstash/OpenAI/OpenRouter                                                                                                                                                                                   |
| `src/__tests__/rate-limit.test.ts` | Middleware tests with mocked Upstash                                                                                                                                                                                                      |
| `src/__tests__/cors.test.ts`       | Allow/deny origin paths                                                                                                                                                                                                                   |

## Six QC gates

### Gate 1 — `packages/shared/` + `packages/api/` scaffold green

1. `packages/shared/package.json` exists; `pnpm install` succeeds.
2. `packages/api/package.json` exists with Hono + Upstash deps.
3. Workers re-imports from shared; **all** workers tests still pass.
4. `pnpm -r lint` exits 0.
5. `pnpm -r typecheck` exits 0.
6. `pnpm -r test` exits 0 — moved tests pass under shared, workers tests still pass, api placeholder tests pass.
7. `pnpm format:check` exits 0.

### Gate 2 — `POST /api/match` works locally

1. Hono app exposes `POST /api/match` with `zValidator('json', MatchRequestSchema)`.
2. `vercel dev` (or `tsx packages/api/api/[[...route]].ts` via Hono's standalone node adapter for tests) runs the function locally.
3. `curl -X POST localhost:3000/api/match -H 'content-type: application/json' -d '{"lines":["milk 2L"]}'` returns 200 with `results` array (will be `needs_attention` until `canonical_products` is seeded — expected, not a bug).
4. Oversized input (line >200 chars OR list >100 items OR body >32 KB) returns 400 with `error.code: 'INPUT_TOO_LARGE'`.
5. Empty body / malformed JSON returns 400 with `error.code: 'INVALID_BODY'`.
6. Mocked-pipeline unit tests cover: happy path, validation failures, downstream-DB-failure → 500 with no leak of DB error text.

### Gate 3 — Security hardening verified

1. Rate-limit middleware live: 31st request in 60s window returns 429 with retry-after header.
2. `.vercelignore` in place; `vercel build` output bundle does **not** contain `.env.local`, `docs/`, `memory/`, `.dbpass`, `*.sql`, or `packages/workers/`. Verified by inspecting `.vercel/output/` after build.
3. CORS middleware: request with allowed `Origin` header → response includes `Access-Control-Allow-Origin`; disallowed origin → no CORS headers.
4. Error responses: deliberately throw inside a route → response is `{ error: { message: 'Internal Server Error', code: 'INTERNAL', request_id: '...' } }`. No stack, no SQL, no internal details.
5. Request log: log lines contain hashed IP + device, never raw line text.
6. LLM call cap: a payload that would force N>MAX_LLM_CALLS_PER_REQUEST LLM calls truncates to the cap; remaining lines return `needs_attention` with a `truncated: true` marker.
7. `X-Request-Id` set on every response, including errors.

### Gate 4 — Vercel preview deploy

1. Vercel project `basketgap-api` created in team `team_RL7l6U4gJrlPx1yP9gkfRPAx`.
2. Repo linked (Vercel git integration; root dir = `packages/api`).
3. Env vars set in Vercel dashboard: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (optional), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALLOWED_ORIGINS`, `SENTRY_DSN_API` (optional), `MAX_LLM_CALLS_PER_REQUEST` (optional, defaults to 10).
4. Upstash Redis instance provisioned via Vercel Marketplace; URL/token populated as Vercel env vars (Marketplace integration does this automatically).
5. Preview deployment succeeds (`mcp__plugin_vercel_vercel__deploy_to_vercel`).
6. External `curl https://<preview-url>/api/match -d '{"lines":["milk 2L"]}'` returns 200.
7. Preview URL recorded in the round's commit message.

### Gate 5 — Production deploy + CI

1. Production deployment succeeds (Vercel git integration auto-deploys `main`, or explicit production deploy).
2. `gh run watch` confirms post-push CI run is green (lint/typecheck/test/format-check).
3. Spending caps confirmed in OpenAI + OpenRouter dashboards (manual — user verifies).
4. External `curl https://basketgap-api.vercel.app/api/match -d '{"lines":["milk 2L"]}'` returns 200.
5. Vercel deployment logs show no warnings/errors.
6. Rate-limit working end-to-end against production (one quick burst test, then back off).

### Gate 6 — Docs, commit, push, memory

1. Secrets scan clean.
2. `pnpm audit --prod` no critical/high.
3. `docs/decisions.md` has Round 8 entries.
4. `README.md` status updated.
5. Commit message: `feat(api): Round 8 — Vercel-hosted API with rate-limited /match endpoint`.
6. Push to `main` succeeds; CI green post-push.
7. Memory file `project_basketgap_round8.md` written; `MEMORY.md` index updated.

## Out of scope (later rounds)

- Mobile app (`apps/mobile/`)
- Additional endpoints: `/specials`, `/postcodes`, basket-level optimisations, `/health`, `/version`
- User accounts / auth / sign-in
- Custom domain (purchase + DNS + SSL)
- Web client / admin dashboard
- Postcode→store mapping data ingestion (zones table population)
- WAF / Cloudflare in front of Vercel
- Real production seeding of `canonical_products` (separate task; needs OpenAI budget)
- Vercel Edge Functions experiment (we're on Node runtime for Round 8 since matching pipeline uses `postgres-js` which requires Node APIs)

## Resumption protocol

Same pattern as Round 7. On any resumption: read this plan, then walk each gate's checks. First gate whose checks don't all pass is where we resume. Memory writes at each gate completion for cross-session continuity.
