# Decisions Log

## 2026-05-11

- Name: BasketGap (one word, no space)
- Platform: iOS first, Android 2-4 weeks later
- Stack: React Native via Expo, Supabase, Vercel, GPT-4o mini primary
- v1 scope: type/paste input only, no photos, no member pricing toggle
- Refresh: nightly baseline + targeted as needed

## 2026-05-16

- **v1 scope expanded to include Down Down (Coles) and Prices Dropped (Woolworths) web surfaces.**
  Previously v1 was catalogue-PDF-only. Adding the always-current web "specials" pages closes a credibility gap (PDFs miss thousands of currently-active reductions). Architecture stays additive: PDF adapter is primary per retailer; web adapter runs daily and writes into the same `specials` table via a `source_type` discriminator. Accepts a softer legal posture than PDFs (public web pages vs. distributed marketing material) — mitigated by browser-like requests, slow pacing, respect for robots.txt.

- **ALDI deferred to v1.1.**
  v1 covers Coles and Woolworths only. ALDI weekly catalogues and Special Buys are noted in `catalogue-research-notes.md` but are not in scope until after v1 ships. Reason: narrower v1 ships faster and lets the matching engine mature against two retailers before adding a third with different cadence and category mix.

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
  `@supabase/supabase-js` is not used in workers — that client is reserved for the eventual mobile/API surfaces. postgres-js is configured with `{ prepare: false, max: 1 }`: pgbouncer transaction mode does not support cross-transaction prepared statements, and cron workers are ephemeral so a single connection is the right shape. Pooler hostname is region-specific (`aws-N-REGION.pooler.supabase.com` for this project); copy the exact connection string from Supabase dashboard → Connect → Transaction pooler rather than hand-assembling.

- **Drizzle schema hand-written at `packages/workers/src/db/schema.ts`, not pulled.**
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
  `[retailer-site]` is a JavaScript-rendered SPA; static HTML contains no PDF URLs. Discovery options (reverse-engineering Coles' backend API, headless browser via Playwright) carry separate legal/operational risk and bring their own dependency stack. Both will land paired with the Down Down web adapter round, which already needs a headless browser. Until then, this adapter is fixture-driven plus `workflow_dispatch` with a manual URL input.

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
  `[retailer-site]` is a JS-rendered SPA; raw `fetch` returns an empty shell. `_shared/browser.ts` wraps Playwright headless Chromium with a single `renderHtml(url, { waitForSelector })` entrypoint that navigates `domcontentloaded`, waits for the product-tile selector, performs a small number of scroll passes to trigger lazy-loaded tiles, and returns the rendered HTML as a `CatalogueSource`. The Coles-web parser is pure cheerio over that HTML and shares the existing `_shared/persist.ts` writer. The DB already accepts `catalogues.source_type = 'web'` and `specials.promo_type = 'down_down'`, so no schema change. `ParsedCatalogue.sourceType` widened from `'pdf'` to `'pdf' | 'web'`.

- **HTML fixtures committed; no synthesized HTML at test time.**
  PDFs are distributed marketing material — we render them at test time via `pdf-lib`. Web pages render small enough that committing a hand-crafted HTML fixture (`test/fixtures/coles-down-down-sample.html`) keeps tests deterministic without ever copying real Coles content. The fixture covers Down Down, half-price, percent-off, multi-buy, member-locked (must drop), and a save-only-in-promo-line tile.

- **Web ingestion runs daily at 06:00 AEST, single fire, separate concurrency.**
  `.github/workflows/ingest-coles-web.yml` runs `0 20 * * *` (UTC) plus `workflow_dispatch`. No 30-min retry sweep like PDFs — these pages mutate continuously, so multiple fires per day would over-count. Concurrency group `ingest-coles-web`, gated on `vars.CATALOGUE_URL_COLES_WEB` (skips gracefully when unset). The Playwright browser binary is installed inside the workflow via `pnpm --filter @basketgap/workers exec playwright install --with-deps chromium`. The lint/typecheck/test CI workflow does **not** install browsers — unit tests parse the committed HTML fixture.

- **Woolworths "Prices Dropped" web adapter mirrors the Coles-web shape.**
  `packages/workers/src/adapters/woolies-web/{parse,index}.ts` reuses every shared module from Round 5 (`_shared/browser.ts`, `_shared/persist.ts`, `loadHtmlFromFixture`). The only Woolies-specific code is the cheerio parser (different tile selectors — `[tile-selector]`, `[data-testid="tile"]`, `.product-tile-v2`) and the orchestrator. Same parser/fixture/persist/CLI pattern as Coles-web; same idempotency-on-source-hash; same silent member-locked drop. Promotion taxonomy already supports `'prices_dropped'` (added in Round 4 for the PDF parser). Two specialist parsers beat one general-purpose parser with a retailer flag — same call as the PDF round.

- **Daily Woolies-web cron offset 30 min from Coles-web.**
  `.github/workflows/ingest-woolies-web.yml` runs `30 20 * * *` (UTC) — 06:30 AEST. Stagger avoids GitHub-side minute-of-hour contention and isolates failure modes so one retailer's parser regression doesn't pause the other. Concurrency group `ingest-woolies-web`, gated on `vars.CATALOGUE_URL_WOOLIES_WEB`. Same skip-gracefully-when-unset behaviour as the other three cron workflows.
