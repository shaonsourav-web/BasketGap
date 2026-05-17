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
