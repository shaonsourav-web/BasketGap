# Decisions Log

## 2026-11-23 — Per-line LLM cap reporting

- The cap records a skip on the line whose eligible call it blocks. The API
  uses that line's audit entry for `truncated`, and counts calls at the
  provider boundary so declines count and blocked calls do not. The
  request-wide cap and the deterministic matching rules stay the same.

## 2026-11-23 — Opt-in mobile catalogue offers

- Expo bundles a public mode flag and API origin. Offline sample data remains
  the default. Live errors stay visible and never fall back to sample prices.
- The app sends product text separately from supported leading counts of up to
  24 units and sums in integer cents. Ambiguous quantities and conditional
  offers are left unpriced. Both totals use only lines priced at both stores.
- A comparison shows the oldest import timestamp among the offers displayed.
  An unresolved postcode limits the API to offers without a state restriction.

## 2026-05-11

- Name: BasketGap (one word, no space)
- Platform: iOS first, Android 2-4 weeks later
- Stack: React Native via Expo, Supabase, Vercel, GPT-4o mini primary
- v1 scope: type/paste input only, no photos, no member pricing toggle
- Refresh: nightly baseline + targeted as needed

## 2026-05-16

- **v1 scope expanded to include Down Down (Coles) and Prices Dropped (Woolworths) web surfaces.**
  Previously v1 was catalogue-PDF-only. Adding the always-current web "specials" pages closes a credibility gap (PDFs miss thousands of currently-active reductions). Architecture stays additive: PDF adapter is primary per retailer; web adapter runs daily and writes into the same `specials` table via a `source_type` discriminator. Accepts a softer legal posture than PDFs (public web pages vs. distributed marketing material) — mitigated by conservative request pacing and respect for robots.txt.

- **ALDI deferred to v1.1.**
  v1 covers Coles and Woolworths only. ALDI weekly catalogues and Special Buys are noted in the retailer research notes (now kept outside this repository) but are not in scope until after v1 ships. Reason: narrower v1 ships faster and lets the matching engine mature against two retailers before adding a third with different cadence and category mix.

- **Refresh cadence changed from "nightly baseline + targeted refresh" to source-specific schedules.**
  - Catalogue PDFs: polled Wednesdays every 30 minutes, 3am–6pm Sydney, until a new catalogue is detected and successfully ingested. If 6pm Wednesday passes with no new catalogue, an alert fires.
  - Down Down / Prices Dropped web: daily ingestion (single run; cadence TBD when the web adapter round is planned).
    Reason: catalogue PDFs publish on a known weekly cadence — nightly polling wasted budget. Web Down Downs change continuously, so daily is the right granularity.

- **Full DB schema (six tables) delivered in one round instead of fragmenting across multiple rounds.**
  `catalogues`, `specials`, `canonical_products`, `retailer_skus`, `zones`, `price_observations` all created in the initial migration. Schema migrations are cheap; consolidating avoids a second schema round before the matching engine. Trade-off: design choices for canonical-product and SKU-bridge tables may need a follow-up migration once matching engine reveals edge cases. Accepted.

## 2026-05-17

- **Workers package layout: pnpm workspace, `packages/workers/`.**
  Reserves `apps/*` and `packages/*` globs in `pnpm-workspace.yaml` for future `api`, `shared`, and `mobile` siblings. Avoids restructuring when those land. Root is `private: true` with `packageManager: pnpm@11.0.9` pinned via Corepack; Node 24 pinned via `.nvmrc` and `engines.node` on every package.

- **DB access from workers: Drizzle ORM + postgres-js, transaction pooler 6543.**
  `@supabase/supabase-js` is not used in workers — that client is reserved for the eventual mobile/API surfaces. postgres-js is configured with `{ prepare: false, max: 1 }`: pgbouncer transaction mode does not support cross-transaction prepared statements, and cron workers are ephemeral so a single connection is the right shape. Pooler hostname is project-specific; copy the exact connection string from Supabase dashboard → Connect → Transaction pooler rather than hand-assembling.

- **Drizzle schema hand-written (now at `packages/shared/src/db/schema.ts`), not pulled.**
  Plan called for `drizzle-kit pull` to bootstrap the schema file. drizzle-kit 0.31.10 crashes parsing this DB's CHECK constraints (`Cannot read properties of undefined (reading 'replace')` at bin.cjs:17861), and the 1.0.0-rc.2 line requires a drizzle-orm bump that introduces incompatible internal subpath exports. Hand-writing from a direct `information_schema` introspection is the path the plan reserves for the matching-engine round (when Drizzle becomes hand-evolved + `generate`); we just arrive there earlier. Supabase migrations under `supabase/migrations/` remain the single source of truth — any schema change re-runs the introspection and updates `schema.ts` accordingly. CI drift check still deferred.

- **Sentry installed but not initialized this round.**
  `@sentry/node` is a workers dependency, but `src/lib/observability.ts` only exports stderr-writing stubs (`log(level, msg, meta)` and `captureException(err, meta)`). Real `Sentry.init()` lands in the first adapter round when a DSN exists, so errors aren't silently swallowed by a no-op stub.

- **Supabase CLI pinned via pnpm devDependency, not Homebrew.**
  `supabase@2.98.2` is now a root devDependency; the lockfile is authoritative. Build-script execution is gated by `allowBuilds: { esbuild: true, supabase: true }` in `pnpm-workspace.yaml` (pnpm 11 requires explicit allowlisting). The brew binary still works locally but is no longer the reference; CI and local converge on the lockfile version via `pnpm exec supabase ...`.

- **One CI workflow this round, no crons.**
  `.github/workflows/ci.yml` runs on push to `main` and on PR: checkout → corepack enable → setup-node with `.nvmrc` and pnpm cache → `pnpm install --frozen-lockfile` → `pnpm -r lint` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm format:check`. The workflow does not reference any DB env or secrets — tests are unit-only. Cron workflows land per-adapter in later rounds.

- **CI drift check for Drizzle schema vs live DB deferred.**
  A nightly job that runs `drizzle-kit pull` and diffs against the committed `schema.ts` would catch out-of-band schema changes. Not worth it until drizzle-kit's CHECK-constraint bug is fixed (otherwise the check runs red on a working DB). Revisit when drizzle-kit hits a fixed stable release.

## 2026-05-18

- **PDF text extraction via `unpdf`, not `pdf-parse` or `pdfjs-dist`.**
  `unpdf` is a modern ESM wrapper around pdf.js with no native dependencies and tree-shakeable surface. `pdf-parse` is unmaintained; raw `pdfjs-dist` has a heavier import path and no convenience for per-page text. `unpdf` exposes `getDocumentProxy` + `extractText({ mergePages: false })` which is exactly the shape the line-level parser wants.

- **Coles PDF parser is line-level, price-anchored, not coordinate-aware.**
  Catalogue PDFs use a regular price-tag layout (item name, brand, size, special price, savings). Coordinate-aware parsing (using pdf.js text positions) is more accurate but more brittle when the catalogue template shifts. Our parser scans flattened per-page lines, finds price-anchor lines via `/\$\s?\d+(\.\d{1,2})?/`, and expands a small backward/forward window to capture the brand/name/size/save lines that belong to that price. Blocks failing to yield a price are dropped (logged as warning). Precision-first: every false-positive special poisons the matching engine.

- **Idempotency keyed on `catalogues.source_hash` (SHA-256 of bytes), not on `(retailer, source_url, week_start)`.**
  The plan originally proposed a unique on `(retailer, source_url, week_start)`. In practice, Coles serves the same catalogue from CDN-rotated URLs and `valid_from` parses out of header text that may be missing on some templates. Hashing the PDF bytes is a stronger natural key — identical bytes are the same catalogue, end of story. The new partial unique index `specials_catalogue_retailer_sku_unique` on `(catalogue_id, retailer_sku) where retailer_sku is not null` prevents duplicate items within a catalogue when the source has SKUs. Items without retailer SKUs (the common case in marketing PDFs) are inserted unconstrained — duplicates within those are accepted because they're rare and harmless to the matching engine.

- **Synthetic PDF fixture generated at test time from a markdown source.**
  Real catalogue PDFs are arguably distributed marketing material; we keep them out of the repo. `packages/workers/test/fixtures/coles-sample.md` is the human-readable source, `build-sample.ts` renders it to `.cache/coles-sample.pdf` via `pdf-lib`. The cache directory is gitignored. The fixture is designed to exercise every parser branch (standard, half-price, Down Down, percent-off, multi-buy, member-locked exclusion, integer prices, missing-price drop).

- **Adapter directory shape: `packages/workers/src/adapters/coles-pdf/`.**
  Four files: `discover.ts` (load bytes from URL or fixture), `parse.ts` (pure function over text lines), `persist.ts` (Drizzle transactional insert), `index.ts` (orchestrator + CLI surface). Cross-cutting utilities (HTTP retry, currency parsing) will move to `src/adapters/_shared/` lazily — extracted when the second adapter (`woolies-pdf/`) actually needs them, not pre-emptively.

- **Sentry init now wired with `SENTRY_DSN` optional.**
  `initObservability()` is called at CLI entry. When `SENTRY_DSN` is set it calls `Sentry.init({ dsn, tracesSampleRate: 0 })`; when unset it's a no-op. `captureException` always writes to stderr and additionally forwards to Sentry when initialized. Round 2's stub-only stance is now replaced with a real init that degrades gracefully — same end-state for local fixture runs (stderr only), but production cron runs with the DSN secret will report errors.

- **Cron schedule: Wednesday 03:00–18:00 AEST every 30 min, two cron lines.**
  GitHub Actions cron is in UTC, so the AEST window splits across two days: Tue 17:00–23:30 UTC and Wed 00:00–08:00 UTC. Both cron expressions are listed under `schedule:`. `concurrency: ingest-coles-pdf` prevents overlap if a run drags. Cron job exits 0 with a "no source URL configured" log when neither the repo Variable `CATALOGUE_URL_COLES` nor a `workflow_dispatch` input is supplied — keeps the schedule wired without failing when the live URL is still TBD.

- **Live PDF URL discovery deferred.**
  The retailer's catalogue index is a JavaScript-rendered SPA; static HTML contains no PDF URLs. Discovery options (reverse-engineering Coles' backend API, headless browser via Playwright) carry separate legal/operational risk and bring their own dependency stack. Both will land paired with the Down Down web adapter round, which already needs a headless browser. Until then, this adapter is fixture-driven plus `workflow_dispatch` with a manual URL input.

- **CI does not run the ingest workflow.**
  `.github/workflows/ci.yml` (lint/typecheck/test/format-check) is the only workflow on `push` and `pull_request`. The new `ingest-coles-pdf.yml` runs only on `schedule` and `workflow_dispatch`. Test-suite integration tests against the live DB are gated by `DATABASE_URL` and skip in CI (env not set). Live integration tests remain a local-developer concern this round; running them in CI requires careful network egress + test-data isolation that's not worth setting up before the matching engine round.

- **Use Node 24's built-in `fetch` for PDF downloads — no `axios`, no `node-fetch`.**
  `discover.fetchPdf(url)` calls global `fetch` with a User-Agent identifying BasketGap, a single retry on 429/503 honouring `Retry-After`, and content-type validation. No new HTTP dependency. When the future Woolies adapter shares the retry policy, we extract to `_shared/`.

- **Shared adapter scaffolding lifted to `src/adapters/_shared/` ahead of Woolies.**
  `CatalogueSource`, `ParsedSpecial`, `ParsedCatalogue`, `IngestOptions`, `IngestResult` types, the `loadFromFixture`/`fetchPdf` discover module, the `extractPdfPages` unpdf wrapper, and the `persistCatalogue` function all live under `src/adapters/_shared/`. The retailer-specific code is now just the `parse.ts` regex set plus a thin `index.ts` orchestrator. `persistCatalogue` reads `parsed.retailer` and writes the correct discriminator into `catalogues` / `specials` rows. Refactor performed during Round 4 Gate 1; Coles tests (14 unit + 3 integration) stayed green throughout.

- **Woolworths PDF adapter — new retailer, separate parser file.**
  `packages/workers/src/adapters/woolies-pdf/{parse,index}.ts` mirrors the Coles adapter's shape. The two parsers don't share regex sets because Woolies templates differ enough that a generic would be flag-heavy and harder to maintain than two specialists. Concrete differences encoded:
  - "Save $X.XX" frequently appears _above_ the price (Coles puts it below). The Woolies parser strips the SAVE token before running the PRICE regex so the special-price extractor doesn't latch onto the savings amount.
  - "Prices Dropped" is the Woolies equivalent of Coles' "Down Down" and maps to `promo_type='prices_dropped'`. The `promoType` union widens; `specials.promo_type` stays `text`, no schema change.
  - "Members only" / "Rewards member price" lines are dropped, same as Coles' flybuys handling, with a slightly different regex.

- **Price-anchor selection guards against save-line hijacking.**
  Both parsers walk per-page lines and treat any line containing a `$` token as a price anchor. The Woolies layout (save-above-price) exposed a bug: a line like `save $1.50` would match the PRICE regex and the iterator would treat the save value as a special price. Fix: before treating line `i` as an anchor, strip the SAVE pattern and check whether a price still remains. Lines that are _only_ save amounts are skipped; the actual price line on the following row becomes the anchor and its backward scan pulls the save line into the block. Coles tests stay green because Coles' fixture has save-below-price (the regex's `.match()` returns the first match which is the actual price). Same logic applied to both parsers for robustness.

- **CLI dispatcher is a name-keyed map of orchestrators.**
  `src/commands/ingest.ts` now picks between `coles-pdf` and `woolies-pdf` via a `Record<string, (opts) => Promise<IngestResult>>` lookup. Adding the next adapter (web surfaces, ALDI) means appending a single map entry. The flag parser, error-handling path, and JSON summary shape are shared.

- **Two cron workflows, same schedule, separate concurrency groups.**
  `.github/workflows/ingest-coles-pdf.yml` and `.github/workflows/ingest-woolies-pdf.yml` use identical cron expressions (Wed 03:00–18:00 AEST, every 30 min, split across two UTC ranges) but each has its own `concurrency.group` so a regression in one retailer's parser doesn't pause the other. Both gracefully exit 0 when their respective repo Variable (`CATALOGUE_URL_COLES` / `CATALOGUE_URL_WOOLIES`) is unset, so the schedules stay wired without failing until the live URLs are supplied.

- **Coles "Down Down" web adapter via Playwright + cheerio.**
  The Coles specials page is a JS-rendered SPA; raw `fetch` returns an empty shell. `_shared/browser.ts` wraps Playwright headless Chromium with a single `renderHtml(url, { waitForSelector })` entrypoint that navigates `domcontentloaded`, waits for the product-tile selector, performs a small number of scroll passes to trigger lazy-loaded tiles, and returns the rendered HTML as a `CatalogueSource`. The Coles-web parser is pure cheerio over that HTML and shares the existing `_shared/persist.ts` writer. The DB already accepts `catalogues.source_type = 'web'` and `specials.promo_type = 'down_down'`, so no schema change. `ParsedCatalogue.sourceType` widened from `'pdf'` to `'pdf' | 'web'`.

- **HTML fixtures committed; no synthesized HTML at test time.**
  PDFs are distributed marketing material — we render them at test time via `pdf-lib`. Web pages render small enough that committing a hand-crafted HTML fixture (`test/fixtures/coles-down-down-sample.html`) keeps tests deterministic without ever copying real Coles content. The fixture covers Down Down, half-price, percent-off, multi-buy, member-locked (must drop), and a save-only-in-promo-line tile.

- **Web ingestion runs daily at 06:00 AEST, single fire, separate concurrency.**
  `.github/workflows/ingest-coles-web.yml` runs `0 20 * * *` (UTC) plus `workflow_dispatch`. No 30-min retry sweep like PDFs — these pages mutate continuously, so multiple fires per day would over-count. Concurrency group `ingest-coles-web`, gated on `vars.CATALOGUE_URL_COLES_WEB` (skips gracefully when unset). The Playwright browser binary is installed inside the workflow via `pnpm --filter @basketgap/workers exec playwright install --with-deps chromium`. The lint/typecheck/test CI workflow does **not** install browsers — unit tests parse the committed HTML fixture.

- **Woolworths "Prices Dropped" web adapter mirrors the Coles-web shape.**
  `packages/workers/src/adapters/woolies-web/{parse,index}.ts` reuses every shared module from Round 5 (`_shared/browser.ts`, `_shared/persist.ts`, `loadHtmlFromFixture`). The only Woolies-specific code is the cheerio parser (different tile markup from Coles) and the orchestrator. Same parser/fixture/persist/CLI pattern as Coles-web; same idempotency-on-source-hash; same silent member-locked drop. Promotion taxonomy already supports `'prices_dropped'` (added in Round 4 for the PDF parser). Two specialist parsers beat one general-purpose parser with a retailer flag — same call as the PDF round.

- **Daily Woolies-web cron offset 30 min from Coles-web.**
  `.github/workflows/ingest-woolies-web.yml` runs `30 20 * * *` (UTC) — 06:30 AEST. Stagger avoids GitHub-side minute-of-hour contention and isolates failure modes so one retailer's parser regression doesn't pause the other. Concurrency group `ingest-woolies-web`, gated on `vars.CATALOGUE_URL_WOOLIES_WEB`. Same skip-gracefully-when-unset behaviour as the other three cron workflows.

## 2026-05-19 — Round 7: Matching engine (Layer 3 Input Intelligence)

- **Matching pipeline is deterministic-first, LLM-last.**
  The nine pipeline steps run in fixed order — clean → spell-correct → shorthand → quantity-size → direct lookup (pg_trgm) → vector search (pgvector) → rank → LLM fallback → cache. Every input passes through every deterministic step before any token is spent on an LLM call. The LLM is gated on the ranker producing a top score below the `assumed` threshold (0.55); above that, the deterministic answer is final. This is the difference between this app and the alternatives: text similarity, vector similarity, brand match, size match, and a popularity prior compose mechanically, and the resulting ranking is auditable end-to-end before an LLM ever sees the input.

- **Confidence bands: matched ≥ 0.80, assumed ≥ 0.55, needs_attention < 0.55.**
  Three bands map to three UX states: silent acceptance, "we picked this — tap to change" disclosure, and "we couldn't match — pick from a shortlist." Two thresholds (not one) avoid the binary trap where a 0.79 match is treated identically to a 0.20 match. Constants live in `matching/types.ts` (`BAND_THRESHOLDS`) so the ranker, the LLM gate, and downstream UI all read from a single source.

- **Ranker weights: text 0.35, vector 0.30, size 0.15, brand 0.10, popularity 0.10 + exact-match boosts.**
  The weighted sum reflects empirically what users type. Names dominate ("milk", "snags"); sizes disambiguate ("milk 2L" vs "milk 1L"); brand and popularity are tie-breakers, not deciders. Sum = 1.0 so scores stay in [0, 1] without renormalisation. Exact-match boosts kick in when `textSimilarity ≥ 0.95`: the final score floor lifts to 0.9 (with size match) or 0.82 (without), preventing the trigram-only path (no `OPENAI_API_KEY` → vector component zeroed) from collapsing every exact-name match into the `needs_attention` band.

- **LLM fallback is constrained-output: it picks from a shortlist or declines.**
  The OpenRouter prompt names every shortlist candidate by id and forbids the model from inventing ids. The post-parse step verifies `chosenId ∈ shortlist`; out-of-set ids are dropped to `null` with reasoning `"LLM chose id outside shortlist"`. This blocks the most common LLM hallucination — synthesising a plausible-looking UUID — from ever reaching the persistence layer. Strict JSON is requested; if the model wraps the JSON in prose, a regex-based recovery extracts the first `{...}` block before parsing.

- **OpenRouter default model: `google/gemini-2.0-flash-001`.** _(Superseded 2026-09-02 — single Gemini provider; see that entry.)_
  Fast, cheap (≈$0.075/M input, $0.30/M output), strict-JSON capable. Overridable via `OPENROUTER_MODEL`. The pipeline never depends on a specific provider's quirks: only the constrained-output contract matters. When pricing shifts, the override is a single env var.

- **Embeddings: OpenAI `text-embedding-3-small`, 1536 dims.** _(Superseded 2026-09-02 — `gemini-embedding-001` at 1536 dims; see that entry. The 1536 width, and therefore the schema, is unchanged.)_
  Matches the existing `canonical_products.embedding vector(1536)` column committed in Round 1 — no migration needed. Smaller and ~10× cheaper than `-large`; the matching task is single-sentence semantic similarity where the small model is empirically sufficient. The model name is pinned in `matching/lib/embeddings.ts`; bumping requires a re-seed (and a migration if dims change).

- **`match_cache` is keyed on the cleaned-input hash, not the raw input.**
  Two basket lines that differ only in punctuation, casing, or trailing units collapse to the same SHA-256 hash after the clean + spell-correct + shorthand + quantity-size pipeline. This maximises cache reuse without poisoning it: only the determinstic-prefix output (which by construction is stable) participates in the key. The cache is **postcode-independent** — a "milk 2L" in Sydney resolves to the same canonical product as one in Perth; the postcode-specific layer is price lookup, not identity resolution.

- **`match_cache.hit_count` increments on read, not on write.**
  Reads bump `hit_count` + `last_used_at` via a write-back, so the table accumulates an organic popularity signal that future ranker tuning can feed into the popularity prior. Today it's instrumentation; later it's a feedback loop. The read path takes one extra round-trip but cache hits are cheap regardless.

- **Cache writes only fire above the needs_attention floor.**
  `needs_attention` results are not cached, on the theory that the canonical catalogue may grow and a previously-unmatched input could become matchable next round. Caching a failure would lock in a stale "no match" answer until manual eviction. `matched` and `assumed` results cache freely.

- **Canonical seed: 152 hand-curated entries across 10 categories.**
  Dairy, bakery, eggs, pantry, produce, meat, frozen, snacks, drinks, household. The seed is intentionally small enough to embed in a single OpenAI batch but broad enough to exercise every step of the pipeline (size variants, brand-anchored entries, brand-agnostic entries, plural/singular pairs, Aussie-specific staples). Future enrichment via the `enrich-skus` command grows the catalogue from real retailer data. Seed IDs are deterministic — `deterministicUuid(name, brand, category, uom, value)` — so re-running the seed against the same entries is idempotent without coordination.

- **`workers seed canonical` requires an embeddings key for live runs; dry-run plans without it.** _(The var is `GEMINI_API_KEY` from 2026-09-02; was `OPENAI_API_KEY`.)_
  Embeddings are mandatory for the vector path, so live seeding can't degrade to no-embed mode. But `--dry-run` short-circuits before any API call and reports the insert / refresh / already-present split, which is enough for CI smoke tests and local plan-checks. `--force-refresh` re-embeds every entry — useful when bumping the embedding model.

- **`workers enrich-skus` walks `selectDistinctOn(retailer, retailer_sku)`.**
  A single SKU may appear in dozens of `specials` rows over time (each weekly catalogue is a fresh row). The enrich pass needs one canonical-product decision per SKU, not per observation. PostgreSQL's `DISTINCT ON` with `ORDER BY retailer, retailer_sku, updated_at DESC` picks the freshest name/brand/size for each SKU. The result is written to `retailer_skus` with `match_confidence` derived from the ranker's `finalScore` (clamped to [0, 1], stored as decimal(3,2)).

- **Shorthand expansion uses n-gram lookup up to trigrams.**
  Aussie slang like "long life milk" → "uht milk" or "spag bol" → "spaghetti bolognese" is multi-token. Descending-length matching (3-gram → 2-gram → 1-gram) ensures the longest matching phrase wins, so "long life milk 2L" expands to "uht milk 2L" not "long milk 2L" (where "long" alone has no shorthand entry). The dictionary lives in `matching/dictionaries/shorthand.ts` and is hand-curated; growing it is additive and never requires touching the algorithm.

- **Pipeline degrades cleanly when API keys are absent.**
  No `OPENAI_API_KEY` → vector step returns `[]` and the ranker zeroes the vector component (boost still recovers exact-name matches via the trigram path). No `OPENROUTER_API_KEY` → LLM fallback returns `null` and the deterministic rank is the final answer. Both absent → fully offline matching against the seeded catalogue. This matters because CI runs without secrets, local dev often does too, and the cron failure mode for a transient OpenAI/OpenRouter outage should be "matches still ship, just less accurately" rather than "no matches today."

## 2026-08-13

- **Mobile: iOS and Android from a single codebase — React Native + Expo.**
  The app ships to both platforms from one TypeScript codebase, living as `packages/mobile` in the existing pnpm workspace so it imports types directly from `@basketgap/shared` (the app and the `/match` API cannot drift apart silently). Releases: EAS Build + Submit produce both store binaries from one command; day-to-day changes (screens, logic, copy) ship over-the-air via EAS Update to both platforms simultaneously, with no store review. Flutter was rejected because it introduces a second language (Dart) and severs the shared-types link. Owner prerequisites when the mobile round starts: Apple Developer Program (US$99/yr), Google Play Console (US$25 one-time), an Expo/EAS account. `docs/ios-approval-and-security.md` covers Apple's requirements; Google Play's equivalents (Data Safety form, target-API rules) need their own pass in the mobile round.

- **Catalogue breadth (Round 8.5 Part C) stays within the already-approved data surfaces.**
  Canonical catalogue = the 152-staple hand-curated floor plus bootstrap from real ingested specials via `enrich-skus`, exactly matching the v1 pricing universe (weekly catalogues + Down Down / Prices Dropped). Rejected: external product datasets (Open Food Facts — unnecessary at this scope, and its ODbL share-alike adds obligations for no gain), paid scraper services (the app is free; recurring data costs don't fit), and full-catalogue pulls through retailer backend APIs (bot-protection circumvention; the risk category `decisions.md` 2026-05-16 flagged and never approved). Context worth re-checking later: the ACCC supermarkets inquiry recommended mandated price APIs and a Jan–Feb 2026 Treasury consultation proposed a right-to-scrape for comparison apps — if either lands, revisit standard-price coverage as a post-v1 decision.

## 2026-08-14

- **Eval harness labels are canonical _names_, not ids.**
  `labelled-lines.ts` maps each messy line to the canonical product's `name` string as it appears in `seed/canonical-seed.ts`. Ids are `deterministicUuid(name, brand, category, uom, value)` — opaque, unreviewable in a diff, and they change if a seed row's size is ever corrected. Names are human-checkable, so a reviewer can see at a glance whether a label is right. The consequence is deliberate: the three `Full Cream Milk` rows (1L / 2L / 3L) share one label, so the harness measures **product identity**, not pack-size selection. A test asserts every non-null label exists in the seed, so a typo'd or renamed canonical fails the suite rather than silently scoring as a miss.

- **The harness measures the deterministic path only — no embedding stand-in.**
  It runs with `hasOpenAi: false` / `hasOpenRouter: false`, so the vector step and the LLM fallback short-circuit exactly as they do in a keyless environment. A synthetic lexical "embedding" was considered and rejected: it would have inflated the baseline with numbers that describe the stub rather than OpenAI's `text-embedding-3-small`, which is the opposite of what a tuning gate is for. The published baseline is therefore the engine's **floor** — the quality when both paid signals are unavailable. When the catalogue is embedded and a key is present, real numbers must be recorded separately (live run, not CI).

- **`pg_trgm similarity()` is re-implemented offline in `__tests__/eval/pg-trgm.ts`.**
  The deterministic path is driven almost entirely by `similarity(lower(name), cleaned)` inside `matching/db.ts`, so an offline harness that faked that number would measure nothing. The stand-in reproduces pg_trgm's model exactly — lowercase, non-alphanumerics as word breaks, each word padded to `"  word "` and cut into 3-char windows, de-duplicated into a set, Jaccard over the sets — and `loadCandidatesByName` mirrors the real SQL's `greatest(name, brand)` scoring, `> 0.2` filter, `order by desc`, `limit 10`. It is test-only code; nothing in the pipeline imports it. If the live query's filter or ordering changes, this file changes with it.

- **The harness's cache is a no-op, and every popularity prior is 0.**
  `readCache` always misses and `writeCache` discards, so each labelled line is scored independently of the order the fixture happens to be written in and the numbers stay stable as lines are added. `popularityPrior: 0` for every row matches a cold catalogue with no `match_cache` traffic — the state at launch, and the honest floor for a pre-traffic baseline.

- **Eval assertions are a crash floor, not a quality target.**
  `eval.test.ts` asserts the harness runs, that bands agree with `BAND_THRESHOLDS`, that `needs_attention` never leaks a canonical id, and three loose floors the deterministic path clears today with room to spare (`matched` precision ≥ 0.90, `needs_attention` rate < 0.75, out-of-catalogue deferral ≥ 0.60). Aspirational numbers were deliberately not encoded: the suite's job is to _report_ a quality regression, and a red CI on a number nobody has fixed yet trains people to ignore it. The real gate is the human comparison against the baseline table in `docs/round-8.5-engine-hardening.md`.

- **The report bypasses `console.log` (`fs.writeSync(1, …)`).**
  Vitest 4's default reporter swallows console output from passing tests, which would have hidden the entire point of the suite in a normal `pnpm -r test`. Writing to fd 1 directly makes the baseline visible in every CI run. `pnpm --filter @basketgap/shared test:eval` runs it focused with the verbose reporter.

- **Typo correction is exact-table-first, then bounded fuzzy — and refuses ambiguity.**
  The 46-entry `TYPOS` table stays as a fast path because it encodes things distance cannot infer: spelling _variants_ ("yoghurt" → "yogurt"), and sub-4-character abbreviations ("mlk") that are below any safe fuzzy floor. Everything else falls through to a Damerau–Levenshtein (optimal string alignment) pass in `lib/edit-distance.ts` — implemented in-repo, ~40 lines, no dependency — against a vocabulary precomputed once at module load in `lib/vocabulary.ts`. The policy is deliberately timid, because the failure mode we care about is not "missed a typo", it is "invented a match for something the catalogue does not sell": budget of 1 edit, 2 only from 6 characters up; tokens under 4 characters are never touched; a token already in the vocabulary is never second-guessed; non-word tokens (sizes, units, numbers) are skipped; and **a tie loses** — if two vocabulary words sit at the same best distance the token is left exactly as typed. Adjacent transpositions cost 1, not 2, because phone-keyboard typos are overwhelmingly transpositions ("onoins" → "onions"). Out-of-catalogue deferral stayed at 100% (20/20) across the change, which is the number this policy exists to protect.

- **The fuzzy vocabulary includes catalogue _categories_, not just product names.**
  Vocabulary = canonical name tokens + brand tokens + category names + shorthand/head-default keys + typo-table _values_ (never the misspellings). Categories are in there for a specific reason: without "snacks" as a known word, `snacks` is two edits from the shorthand key `snags` and would have been "corrected" into sausages — turning a correctly-deferred vague line into a wrong match. The general principle: **the cheapest way to make a corrector conservative is to teach it more correct words**, not to tighten the distance bound. Derived from `CANONICAL_SEED` at module load, so the corrector works with zero API keys and no database (the degradation contract).

- **Bare heads resolve to a catalogue default only when the head is the whole line.**
  `HEAD_DEFAULTS` in `dictionaries/shorthand.ts` maps "milk" → full cream, "bread" → white sandwich loaf, "lentils" → the can, and so on. This is not a shorthand entry: shorthand expands anywhere in the line, which would rewrite "almond milk" and "soy milk" into nonsense. The default is applied in step 03 only when the key equals the entire token sequence once trailing size/pack tokens are set aside — so "milk 1L" defaults while "almond milk", "skim milk" and "oat milk 1L" pass through untouched, and a line the catalogue cannot serve ("snacks", "toothpaste") never acquires a default it did not ask for. It exists because bare heads have poor trigram overlap with the longer canonical they should resolve to ("macaroni" scores ~0.56 against "Macaroni Pasta"), which is below every rung of the boost ladder — so without it every one-word staple is silence. Genuinely ambiguous heads ("chips", "sausages", "oil") are deliberately absent: deferring is the correct answer there.

- **Every dictionary expansion must land on a product the seed catalogue actually carries.**
  Enforced by a test (`03-shorthand.test.ts` → "every head default expands to an exact canonical product name"). Expansions are written as the _full_ canonical phrasing wherever the slang is unambiguous ("evoo" → "olive oil extra virgin", not "olive oil") because the offline boost ladder needs trigram similarity ≥ 0.95 to reach `matched` — a partial expansion lands in silence, which for the user is indistinguishable from no dictionary entry at all. Ungrounded slang was left out on purpose: "sav blanc" and "cab sav" have no catalogue row, so they are labelled as expected-deferrals rather than given entries that would pull an unrelated canonical into the shortlist. Two pre-existing ungrounded entries ("goon", "slab") were left alone rather than expanded, and one tail-phrase entry was rejected outright — expansions can only absorb tokens that _follow_ them, so an "extra virgin" key would have produced "olive oil olive oil extra virgin".

- **Round 8.5 A9 result: 85.6% → 99.0% overall on the eval harness, offline path.**
  `matched` precision held at 100%, the single wrong pick went to 0, out-of-catalogue deferral held at 100%. Steps were not reordered and `BAND_THRESHOLDS` / `RANK_WEIGHTS` were not touched — this was entirely step-internal, which is what makes the before/after comparable. Full table in `docs/round-8.5-engine-hardening.md`. Two false negatives remain on purpose (`"icecream 2l"` needs compound splitting; `"bbq snags 500g"` needs semantics only the vector/LLM path can supply) so the harness keeps something to fail on rather than reading 100% and going quiet.

## 2026-08-24

- **`needs_attention` is a decline, never a selected identity or cache record.**
  The pipeline now returns `canonicalProductId: null`, skips cache writes, and ignores any stale low-confidence cache entry when the score is below the assumed threshold. The eval harness records the actual returned ID rather than masking it, so this contract is enforced by both focused and 200-line regression tests.

- **Shopping-list text is untrusted LLM data.**
  The OpenRouter system prompt explicitly forbids following instructions found in the shopping-list line or shortlist. Shortlist membership validation remains the hard output boundary.

- **API development supports both Vercel and standalone Node adapters.**
  `pnpm --filter @basketgap/api dev` exercises Vercel routing; `dev:node` runs the same Hono app with `@hono/node-server`. Vercel framework detection is disabled explicitly because the package supplies its own catch-all function.

- **Security patch versions are pinned without broad dependency churn.**
  Hono, its Zod validator, Sentry, and Upstash were updated within their current architecture. Workspace overrides pin patched `undici` and `brace-expansion` transitive versions until their parents absorb those releases. Production audit and peer checks are clean after the change.

## 2026-09-01 — Offers layer + enrichment identity

- **/api/match now returns offers** (current specials per matched product for both retailers). Offers degrade to `null` with `stats.offers_available=false` on query failure — matching never fails because pricing is down.
- **Enrichment keys on printed identity, not SKU.** All four adapters emit `retailerSku: null` (catalogue sources don't print SKUs), so `enrich-skus` was a no-op and `specials.retailer_sku_id` was never set — the price join could not work. Enrich now falls back to a synthetic `name:<slug>` key, and backfills `specials.retailer_sku_id`. Match query is the printed name (+size only if absent); appending the catalogue brand demonstrably drops generic-canonical matches to needs_attention.
- **`seed canonical --no-embeddings`** seeds the 152 staples with null vectors for the keyless trigram-only configuration (app is free; zero-spend path is first-class). A later keyed seed refresh adds embeddings without wiping anything.
- Local e2e verified against `supabase start` (Docker): seed → 4 fixture ingests → enrich (7/26 linked, rest correctly deferred without embeddings/LLM) → API returns both-store offers.

## 2026-09-01 — Matching accuracy round (blind-gated)

- **Independent blind gold sets are now the accuracy gate** (`packages/shared/src/matching/__tests__/eval/blind/`): 426 lines by Codex, 300 by Opus, each written from the seed file only. The in-house 200-line eval had shared the engine's blind spots (it said 99.0% while the blind baseline was 66.5%).
- Engine changes: brand similarity separated from name similarity (brand agreement can lift a decent name match to _assumed_, never to _matched_); retailer/descriptor noise stripping (words appearing in canonical names are excluded — QC F2); spell-corrector hardened (first-letter pin, ≤1-char shrink, doubled-letter rule, PROTECTED_WORDS); leading-size head defaults; bare-number/orphan-pack stripping; 0.65-name-sim → assumed floor; ~170 new AU shorthand/typo entries; self-map guards (lamb/pork/turkey/chicken mince defer rather than defaulting to beef).
- Results at 98ab50c: codex set 98.9% correct match / 0 wrong picks / 97.6% accepted precision; opus set 98.3% / 0 / 99.6%; in-house 99.5%. Remaining "false accepts" on the codex set are bare generic heads resolving via documented HEAD_DEFAULTS — a labelling philosophy difference, kept as designed.
- Live catalogue capture: retailers block headless browsers; current-week specials were captured via the owner's Chrome session (287 Coles + 38 Woolies) and ingested through the web-adapter fixtures. Historical weeks are not published; history accrues from weekly ingests. Coles' page structure was unchanged; Woolworths had moved its product tiles into shadow-DOM web components — **the woolies-web adapter's extraction needed a rewrite before live scraping could work**.

## 2026-09-02 — Three-lane round: shadow-DOM adapter, bare-head banding, ingest cadence

- **woolies-web adapter rewritten for shadow-DOM product tiles** (built by Opus, verified by Fable): extraction now happens in-page via `locator.evaluateAll` reading open shadow roots (`tiles.ts` pure mapping layer + `scrape.ts` live path); the dead specials route is rewritten to the current routes with per-route fallback; all-routes-empty returns a graceful `blocked_or_empty` outcome (no DB write, no crash) — the expected result from CI/datacentre IPs. External adapter contract unchanged; cheerio retained for fixture parsing only, plus a `parseTilesJson` path for owner-Chrome captures.
- **Bare generic heads now cap at the `assumed` band**: when HEAD*DEFAULTS resolves a line that is purely a bare head (size/pack tokens aside — "coffee", "rice", "milk 2L"), the band is demoted `matched → assumed` so the UI flags the engine's assumption; score, thresholds, weights and step order untouched; cap recorded in the audit trail. Cache keys gain a `|head-default` suffix \_only* when the cap fired, so no existing `match_cache` entry is invalidated and capped lines never share an entry with fully-typed ones. Blind gates re-verified identical (codex 98.9% / 0 wrong / 97.6% precision; opus 98.3% / 0 / 100%).
- **Ingest cadence set to weekly Wednesday morning Sydney** (UTC crons `0/30 20-21 * * 2`, DST drift documented in each workflow): PDFs automated; the two web crons are marked expected-to-be-blocked and classify outcomes green (items) / warn-green (`BLOCKED_OR_EMPTY`) / red (real error). The supported weekly path for web specials is the owner capture runbook `packages/workers/scripts/CAPTURE.md` with `make-fixtures.py` (ported from scratchpad, byte-identical output); see `docs/ingest-cadence.md`.

## 2026-09-02 — Accuracy stress round (pre-Gemini gate)

- Third independent blind set committed: `gold-opus-stress-2026-09-02.json` (250 deliberately-hard lines, Opus-authored from seed only). Baseline engine scored 93.0% / 0 wrong / 2 false accepts on it; an adversarial code review proved 8 further holes (worst: "straws"→Strawberries Punnet at matched via slang-key fuzzy correction; DB-row-order-dependent pack ties; stated-size and dosage-form contradictions still priced as matched).
- Fix round (Opus built, Fable re-verified by execution): corrector vocabulary rebuilt (fuzzy targets = canonical/brand/typo-value words only; shorthand keys exact-only; 2-edit corrections must keep the first two chars or be a transposition), quantity now a pack-size rank signal with deterministic name/id tiebreak, ambiguous shorthand guesses (detergent/mince/cooking oil/fizzy/softie) OR into the assumed-band cap, stated-but-contradicted size caps at 0.79, dosage-form and un-prefix qualifier conflicts cap below assumed, compound splitting (oatmilk→oat milk), trailing-noise allow-list, dictionary adds (chippies/shortcut bacon/brown bread/tortilla), `punnet`/`button` noise-contract violations removed.
- Post-fix, all four sets, Fable-reproduced: codex **99.5%** / 0 wrong / 97.6% precision; opus 98.3% / 0 / 100%; stress **98.0% / 0 wrong / 0 false accepts / 100% precision**; in-house 99.5%. Shared suite 292 passed, typecheck clean.

## 2026-09-02 — Single provider: Gemini replaces OpenAI + OpenRouter

- **Owner decision: this project uses Gemini 2.5 Flash.** The two-provider split
  (OpenAI for embeddings, OpenRouter as the LLM gateway) is replaced by one
  Google Generative Language API v1beta client, `matching/lib/gemini.ts`, and one
  key. `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` are gone;
  the env surface is now `GEMINI_API_KEY` (optional) plus the model overrides
  `GEMINI_LLM_MODEL` (default `gemini-2.5-flash`) and `GEMINI_EMBEDDING_MODEL`
  (default `gemini-embedding-001`). One key enables both tiers, so the previous
  three-way degradation matrix collapses to two states: keyed (vector + LLM) and
  keyless (trigram-only, rank-only). The keyless path — what CI and every eval
  gate exercise — is byte-for-byte unchanged, and the blind gold sets re-scored
  identically after the swap (codex 99.5% / 0 wrong / 97.6% precision; opus
  98.3% / 0 / 100%; stress 98.0% / 0 / 0 false accepts / 100%).

- **Embeddings: `gemini-embedding-001` requested at `outputDimensionality: 1536`
  — no schema migration.** Gemini's native width is 3072; asking for 1536 keeps
  the `canonical_products.embedding vector(1536)` column and the pgvector index
  exactly as committed in Round 1. `EMBEDDING_DIM` stays exported at 1536.
  **Normalisation is load-bearing:** Gemini only returns unit-length vectors at
  its native dimensionality. A truncated 1536-dim vector is NOT normalised, and
  our similarity is cosine (`<=>`), so `embedText` L2-normalises before
  returning — for query vectors and for the vectors the seeder stores alike.
  Skipping it would not error; it would silently degrade every vector search,
  which is why there is a unit test asserting ‖v‖ = 1. A live re-seed is
  required when the key lands: vectors from the old model are not comparable
  with the new model's, regardless of matching width.

- **LLM fallback is now schema-constrained at the API level, not just by prompt.**
  The `:generateContent` call sets `temperature: 0`,
  `responseMimeType: 'application/json'` and a `responseSchema` of
  `{chosenId: string|null, confidence: number}` where `chosenId` carries an
  `enum` of exactly the shortlist ids. Inventing a UUID is now structurally
  impossible rather than merely forbidden by the prompt; step 08 still
  re-validates `chosenId ∈ shortlist` as defence in depth. The purpose-lock
  contract, function signature and semantics (pick one, or decline with null)
  are unchanged. The schema deliberately has **no free-text field** — the old
  `reasoning` string was model-authored prose entering our data for no
  operational benefit; it is now written locally as `gemini:<model>`.

- **Security posture preserved.** The key is server-side only and travels in the
  `x-goog-api-key` header, never the URL (URLs land in proxy and CDN logs);
  it is never logged and never appears in error text. Prompts still carry only
  the cleaned line and candidate ids/names — no device ids, postcodes or raw
  baskets. Provider tests are mock-based and make zero network calls.

- **Context flags renamed to be provider-agnostic.** `PipelineContext.hasOpenAi`
  → `hasEmbeddings`, `hasOpenRouter` → `hasLlm`, `openRouterModel` → `llmModel`.
  Steps 06 and 08 gate on the new names with identical behaviour. A provider name
  in the pipeline contract was what made the previous swap touch every test file;
  the semantic names mean the next one will not.

- **Per-call cost (USD, list rates checked 2026-09-02):** Gemini 2.5 Flash
  $0.30 / 1M input tokens, $2.50 / 1M output tokens → ≈ $0.00017 per
  disambiguation call, ≈ $0.0017 for a request that exhausts the default cap of 10. `withLlmCap` semantics are untouched. Spend ceilings now live in one place
  (Google AI Studio / Cloud billing) instead of two dashboards.

## 2026-09-02 — security hardening (rate limiting, cache growth bound)

- **The rate-limit bucket is the client IP hash alone.** The key was
  `${ipHash}:${deviceIdHash}`, but `x-device-id` is a client-supplied header:
  any caller could rotate it per request and mint an unlimited number of fresh
  buckets, which made the limiter decorative. The key is now `ipHash` only.
  `deviceIdHash` stays on the request context for logging and is no longer part
  of any enforcement decision.

- **The API fails closed in production when the limiter is unconfigured.**
  Previously a missing `UPSTASH_REDIS_REST_URL`/`_TOKEN` silently degraded
  `/api/match` to unlimited traffic — a config slip on a paid, LLM-backed
  endpoint would have been an open spend tap. `rateLimitMiddleware` now takes an
  explicit `{ requireLimiter }` option, computed in `app.ts` from
  `isProductionRuntime()` (`VERCEL_ENV === 'production' || NODE_ENV ===
'production'`); when it is true and no limiter exists the route answers
  `503 { error: { code: 'RATE_LIMIT_UNAVAILABLE' } }`. Preview and local dev keep
  the old pass-through, so nothing about the developer loop changes. The option
  is passed in rather than read from `process.env` inside the middleware so the
  three cases are unit-testable without mutating the environment.

- **Client IP derivation follows a fixed trust order.** `x-vercel-forwarded-for`
  (platform-set, not forwardable by callers) → `x-real-ip` → the **first** entry
  of `x-forwarded-for` → `'unknown'`; values are trimmed and capped at 64 chars.
  The old code read `x-forwarded-for` first, which a caller can set outright, and
  the cap stops an oversized header from bloating the hash input. First entry, not
  last: the last hop is the proxy, and letting a caller append entries would let
  them choose their own bucket.

- **`match_cache` is now bounded.** Nothing in the write path ever deleted a row,
  so the table grew one row per distinct cleaned input forever.
  `pruneMatchCache(db, {maxAgeDays = 90, maxRows = 200000})`
  (`packages/shared/src/matching/cache-prune.ts`) ages out rows whose
  `last_used_at` is past the cutoff, then — only if the table is still over the
  ceiling — drops the least-recently-used rows down to the cap, returning
  `{deletedByAge, deletedByCap, remaining}`. Both passes key off `last_used_at`,
  which `readCache` bumps on every hit, so "cold" means genuinely unused rather
  than merely old. Exposed as `workers prune-cache [--max-age-days N]
[--max-rows N]` and run weekly by `.github/workflows/prune-cache.yml` at
  `0 22 * * 2` — after the 20:00/21:00 UTC ingest crons, so a prune never races a
  run that is still writing cache rows. Matching behaviour, bands, weights and
  step order are untouched: pruning only removes cache entries, and a pruned
  entry is recomputed on next sight.

- **`match_cache.cleaned_input` capped at 256 chars in the database**
  (migration `20260902000000_round9_match_cache_input_cap.sql`). The API already
  rejects basket lines over 200 chars and cleaning only shortens a line, so this
  is belt and braces: a future writer that bypasses the API schema cannot turn
  the cache into unbounded text storage. Declared as a table constraint only —
  `schema.ts` does not declare the existing `match_cache` checks either, so it
  stays the migration's business.

## Round 10 — mobile UI shell

- **Mobile lives at `packages/mobile`, on Expo SDK 57 rather than 53/54.**
  The plan named SDK 53/54, but Expo Go only ships clients for the current SDK
  line, and the iOS Simulator runtime current at the time was iOS 26.5 under
  Xcode 26.6 — an SDK 54 client cannot be installed there, so the app would have been unrunnable as
  specified. SDK 57 (`expo ~57.0.20`, React Native 0.86.3, React 19.2.3) is the
  current stable line and matches the dependency set Expo's own default
  template ships. Verified end to end in the iOS Simulator.
- **`engines.node` on `@basketgap/mobile` is `>=24.0.0`, with no upper bound.**
  Every other package pins `>=24.0.0 <25`. Expo's toolchain runs fine on newer
  Node and pinning the app to 24 would block anyone on a current runtime; pnpm
  already emits (non-fatal) engine warnings for the other packages on Node 26.
- **No Metro or Babel config.** Expo's defaults resolve the pnpm-isolated
  `node_modules` layout without help — `expo export --platform ios` bundles
  1,265 modules clean from the workspace. Adding a monorepo `metro.config.js`
  or `node-linker=hoisted` would have been cargo cult.
- **One accent, and it is teal — deliberately neither red nor green.**
  A green accent would read as a nudge towards Woolworths and a red one towards
  Coles. Retailer colours appear only as 6–8px identity dots beside a store's
  name. Difference amounts are set in ink, not in the cheaper store's colour,
  so a price gap never reads as an alarm or an endorsement.
- **Type: Outfit for the brand and every figure, Plus Jakarta Sans for running
  text**, both via `@expo-google-fonts`. Fonts are awaited behind the splash
  screen, because the wordmark is the first thing on screen.
- **The compare engine is mocked, in `src/mock/`, not stubbed behind a flag.**
  `/api/match` returns canonical matches but no prices yet. The mock is
  deterministic and offline, computes in integer cents, and produces the same
  shapes the API will (`ConfidenceBand` and `Retailer` are imported as types
  from `@basketgap/shared`, so the app cannot drift from the engine's
  vocabulary). Ties in the split basket go to whichever store is already
  cheaper overall, so a mixed basket never adds a second stop for nothing.
- **Postcode is the only thing persisted** (`AsyncStorage`, key
  `basketgap.postcode`). Lists are held in memory for the session only, per the
  spec's storage promise.

## 2026-11-01 — LLM fallback moves to OpenAI; embeddings stay on Gemini

- **Owner decision: the LLM disambiguation fallback uses OpenAI.** This partly
  reverses the 2026-09-02 single-provider consolidation (commit `6733b2b`):
  embeddings stay on Gemini `gemini-embedding-001` at 1536 dims, unchanged —
  same client, same normalisation, same stored vectors, so **no re-seed and no
  migration**. Only the choose call moved, into a new
  `matching/lib/openai.ts`; `matching/lib/gemini.ts` is now embeddings-only.
  Plain `fetch` through the existing `fetchExternal` boundary — no SDK, as no
  provider in this repo uses one.

- **Default model `gpt-6-luna`, overridable via `OPENAI_LLM_MODEL`.** Picked
  from OpenAI's model docs (checked 2026-11-01) as the cheapest current model
  with Structured Outputs support: $0.10 / 1M input, $0.50 / 1M output. At
  ~350 input / ~25 output tokens per call that is ≈ $0.00005 per call and
  ≈ $0.0005 for a request that exhausts the default `MAX_LLM_CALLS_PER_REQUEST`
  of 10 — roughly a third of the Gemini 2.5 Flash figure. `GEMINI_LLM_MODEL`
  is removed (a stale value left in a deployment is silently ignored by the env
  schema, not an error).

- **Responses API (`POST /v1/responses`), strict JSON schema.** OpenAI's docs
  recommend Responses over Chat Completions for the GPT-6 line. The request
  sets `text.format = {type: 'json_schema', strict: true}` with
  `{chosenId: string|null, confidence: number}`, `additionalProperties: false`,
  both fields required, and `chosenId` carrying an `enum` of exactly the
  shortlist ids plus `null` — so the purpose-lock is structural, exactly as it
  was under Gemini's `responseSchema`. Step 08's `chosenId ∈ shortlist` check
  is untouched as defence in depth. The raw HTTP response has no top-level
  `output_text` (an SDK convenience); the text is read from `output[]` message
  items, skipping any reasoning items.

- **Reasoning effort `none` + `temperature: 0`.** OpenAI documents that
  `temperature` must be removed whenever effort is not `none`, and that GPT-6
  Astra / GPT-6.1 Sol do not accept `none` at all (HTTP 400). Classification
  from a short list is the use case `none` is documented for, and it keeps
  `temperature: 0` legal, so the call stays as close to deterministic as the
  provider allows. Consequence the owner should know: `OPENAI_LLM_MODEL` must
  name a model that accepts effort `none` (Luna, 6.1 Terra, 6 Sol at time of
  writing); anything else makes every fallback call fail.

- **Three new hardening choices on the OpenAI call, none of which change a
  band, weight, threshold or step order.** `store: false` (the Responses API
  retains responses by default; nothing here needs it, and the security doc
  forbids retaining raw prompts). `max_output_tokens: 128` bounds spend on a
  misbehaving response; a truncated answer (`status: 'incomplete'`) throws
  rather than being parsed. A `refusal` content part becomes a decline
  (`chosenId: null`, confidence 0), never a pick, and its text is not stored.
  `confidence` is now bounded `[0, 1]` both in the schema and by a local clamp,
  because the pipeline lifts the chosen candidate's score to the LLM's
  confidence — an out-of-range number would otherwise have minted a `matched`
  band and a cache row. The provenance tag is written locally as
  `openai:<model>`, as before.

- **The degradation matrix is back to four states, keyed independently.**
  `createDbContext` now takes `geminiKey` (→ `hasEmbeddings`) and `openaiKey`
  (→ `hasLlm`) separately. Neither key → trigram-only and rank-only, fully
  offline and deterministic, zero network calls (byte-for-byte the previous
  keyless path, which is what CI and every eval gate exercise). Gemini only →
  vector search, no LLM fallback. OpenAI only → no embedding call, LLM fallback
  on. Both → both. A new non-live test (`provider-matrix.test.ts`) drives all
  four through the real `createDbContextFromEnv` + `matchLine` with stubbed
  `fetch`, asserting which provider hosts each combination touches. The
  provider-agnostic context names from 2026-09-02 (`hasEmbeddings`, `hasLlm`,
  `llmModel`) are why the pipeline steps did not change at all.

- **Spend ceilings are in two dashboards again** (Google for embeddings, OpenAI
  for the fallback) — the operational cost of this split that the 2026-09-02
  entry had removed. `withLlmCap` semantics are untouched; it caps only the
  OpenAI choose calls, never embeddings.

## 2026-11-01 — Retailer ingest adapters move to a private repo

- **Owner decision (2026-11-01): retailer-specific scraping code leaves the
  public repo before it is published under AGPL-3.0.** Woolworths' terms
  prohibit robots and Coles restricts use of its site; publishing working
  scrapers, their selectors and target URLs would hand that legal risk to the
  project and to anyone who runs it. The four adapters (`coles-pdf`,
  `woolies-pdf`, `coles-web`, `woolies-web`), the HTTP/Playwright fetchers and
  their user-agents, the owner capture runbook and `make-fixtures.py`, the
  retailer-shaped fixtures, the scheduled ingest workflows and the retailer
  research notes now live in a separate private repo, `BasketGap-private-ingest`.
  The 2026-05-16 "softer legal posture" accepted for web surfaces is
  superseded for the public codebase; it is the private repo's concern now.

- **The boundary is "generic pipeline public, retailer knowledge private".**
  Public keeps the adapter contract (`IngestAdapter`, `ParsedCatalogue`,
  `IngestOptions`/`IngestResult`), the hash-keyed upsert (`persistCatalogue`),
  the dry-run/persist tail every adapter repeated (`finishIngest`, now shared),
  the local-file loader, the 14-day freshness rule and the whole matching
  engine. These are exported to plugins as `@basketgap/workers/adapter-kit`.
  Moved adapters were rewired onto that kit and produce byte-identical dry-run
  results on the same fixtures.

- **Retailer adapters plug in through `BASKETGAP_INGEST_PLUGINS`.** A
  comma-separated list of module paths or package names; each module exports
  `adapters: IngestAdapter[]`. The registry validates names and shapes,
  refuses to let a plugin shadow a built-in, and reports a broken plugin on
  stderr without losing the other adapters. An env var rather than a workspace
  member was chosen so the public lockfile and `pnpm -r` never learn the
  private package exists; the private repo instead depends on the public
  packages with `link:` paths and expects a sibling checkout. Unset, the CLI
  prints that no plugins are installed and points at the built-in adapter;
  nothing else in the public repo needs a plugin, so lint/typecheck/test and
  the keyless matching path are unaffected.

- **A retailer-neutral `import` adapter replaces scraping as the public way
  in.** It reads a local JSON or CSV file in a versioned format
  (`basketgap-specials` v1, documented in `docs/ingest-adapters.md`, synthetic
  examples in `packages/workers/examples/import/`) and never touches the
  network. File-level problems throw before anything is written; bad rows are
  skipped with a named warning. Savings are always computed, never accepted,
  so they cannot disagree with the prices. Member-locked rows are rejected,
  the same precision-first rule the catalogue parsers apply (v1 has no member
  pricing). `confidenceScore` is 1: structured input has no layout inference
  to discount. The source URL is recorded as `import://<file name>`, not the
  contributor's local path.

- **The scraper user-agent no longer carries a personal email.** The private
  PDF fetcher identifies as `BasketGap/0.0 (+https://github.com/shaonsourav-web/BasketGap)`.
  The old address remains in git history; purging it (and the moved paths)
  from the public history is a separate, deliberate step whose inputs live in
  the private repo's `history-purge/`.
