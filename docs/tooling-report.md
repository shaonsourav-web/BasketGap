# BasketGap Tooling Report

Research date: 2026-05-11  
Source spec: `BasketGap.md`

This report is research only. It does not install tooling or implement application code.

## Section 1 — Current Stable Tooling (What To Use Today)

### Baseline Runtime And Monorepo

Use **Node.js 24 LTS**, currently the practical production baseline for new JavaScript projects. Node 24 is Active LTS and is supported until April 2028; Expo SDK 55 also requires Node 20.19.x or newer, so Node 24 satisfies the mobile and server toolchains without living on an older runtime ([Node release schedule](https://nodejs.org/en/about/previous-releases), [Expo SDK 55 reference](https://docs.expo.dev/versions/v55.0.0)). The footgun is native dependency support: some older React Native tooling may still assume Node 20/22, so pin Node in `.nvmrc`/`.node-version` and CI instead of letting developers drift.

Use **pnpm 11.0.9** with **pnpm workspaces**. It is fast, deterministic, handles monorepo dependency isolation well, and avoids the ceremony of a larger workspace platform for a small app/API/worker/shared package layout. Alternatives: npm workspaces are simpler but slower and less strict; Yarn Berry is powerful but creates more ecosystem friction; Bun is promising but not the least-risk choice for Expo/Supabase/Vercel in production. Footgun: React Native monorepos need care with Metro resolution, so keep shared packages simple TypeScript and avoid symlink-heavy native modules.

Use **Turborepo 2.9.12 only if task orchestration becomes useful**, not as a day-one requirement. For now, pnpm recursive scripts are enough. Turborepo becomes worthwhile when CI needs cached lint/test/typecheck across packages. Alternative: **Nx 22.7.1** is excellent for very large repos but too heavy for BasketGap's first production scaffold. Footgun: build caches can hide environment mistakes if CI and local scripts are not explicit.

### Mobile: React Native And Expo

Use **Expo SDK 55.0.x** with **React Native 0.83** and **React 19.2.0**. Expo SDK 55 is the current stable Expo SDK, released February 25, 2026, and maps to RN 0.83/React 19.2.0 ([Expo SDK 55](https://expo.dev/sdk/55), [Expo SDK reference](https://docs.expo.dev/versions/v55.0.0)). This is the right production default because the project needs iOS first, later Android, no custom native app logic yet, and EAS Build/Submit will matter quickly. Alternatives: bare React Native 0.85 is newer but not the stable Expo path; Flutter would be a stack change; native Swift/Kotlin would slow the first guest-first MVP. Footguns: SDK 55 dropped Legacy Architecture support, Expo Go had a transition lag for SDK 55, and SDK 56 is imminent, so build with development builds rather than relying on Expo Go ([SDK 55 changelog](https://expo.dev/changelog/sdk-55)).

Use **Expo Router 55.0.14** for navigation. BasketGap's flows are shallow but will still need typed routes for compare results, unmatched item review, settings, and later restore/sign-in. Expo Router is the Expo-native default and reduces React Navigation boilerplate. Alternative: direct **React Navigation 7.2.4** gives more manual control and is still the underlying ecosystem, but it adds unnecessary setup for this app. Footgun: file-system routes can become messy; keep route groups small and domain-free.

Use Expo modules conservatively: **expo-secure-store 55.0.13** for local device ID/account restore tokens, **expo-application 55.0.14** for install metadata if needed, **expo-location 55.1.9** only if optional location-based postcode is implemented, **expo-constants 55.0.16**, **expo-dev-client 55.0.32**, **expo-updates 55.0.21**, **expo-splash-screen 55.0.20**, and **expo-font 55.0.7** if custom typography is later selected. Footgun: every native module changes build/test surface; do not add camera, image picker, receipts, or barcode modules in v1 because the spec explicitly excludes photos and receipts.

### TypeScript

Use **TypeScript 6.0.3** in strict mode. The root config should set `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `moduleResolution: "bundler"` where appropriate, and separate configs for Expo, Node API, workers, and shared packages. TypeScript 6.0 is current stable and the last JavaScript-based compiler before the Go rewrite line, so it is current without betting on the next compiler architecture ([TypeScript 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)). Alternatives: TypeScript 5.9 may have fewer ecosystem surprises; TS 7 preview should not be used yet. Footgun: React Native/Babel transpiles code even when typecheck fails, so CI must run `tsc --noEmit` for packages that can be typechecked.

### Mobile UI

Use **plain React Native components plus a tiny local design system**, not a major UI framework. BasketGap wants a Notes-app aesthetic: quiet input, readable totals, subtle freshness, and no marketing surface. A full component library would fight that. Add **react-native-safe-area-context 5.7.0** and **react-native-screens 4.24.0** through Expo-compatible versions as navigation infrastructure.

Consider **NativeWind 4.2.3** only if the team strongly prefers utility classes. It is fast for layout but can make a calm native UI feel web-ish and can complicate Metro/monorepo setup. Avoid **Tamagui 2.0.0-rc.42** for v1 because the current npm tag is still RC and it introduces a large styling/compiler surface. Avoid **Gluestack UI 1.1.73** unless an accessible component kit becomes more important than bespoke simplicity. Footgun: UI libraries often lag Expo New Architecture changes.

### State, Forms, And Data Fetching

Use **TanStack Query 5.100.9** for server state: compare requests, price freshness, targeted refresh status, and retry/cancel behavior. It is the right fit because the mobile app mostly submits a list and renders server results; it should not invent a client cache for prices. Alternative: SWR is lighter but less common in React Native; plain `fetch` is fine at first but loses retry and status ergonomics.

Use **Zustand 5.0.13 sparingly** for local UI state that must survive navigation, such as current draft list, postcode, result visibility, and user preference prompts. Alternative: Jotai 2.20.0 is elegant for atomized UI state but less necessary here; Redux Toolkit is too heavy. Footgun: do not persist shopping lists by default, because the privacy stance says shopping lists are not stored.

Use **React Hook Form 7.75.0 only if forms grow**. For v1, postcode and grocery list can be controlled components plus schema validation. If validation becomes more complex, React Hook Form is the stable choice. Alternative: Formik is older/heavier; uncontrolled hand-rolled inputs are fine for one screen. Footgun: multiline text input behavior differs on iOS/Android; test paste, autocorrect, keyboard avoidance, and large lists.

### Mobile Testing

Use **Jest 30.4.2**, **jest-expo 55.0.17**, and **@testing-library/react-native 13.3.3** for mobile component/unit tests. Expo documents Jest + `jest-expo` as the expected unit testing route and recommends React Native Testing Library over deprecated `react-test-renderer` with React 19 ([Expo Jest testing](https://docs.expo.dev/develop/unit-testing)). Alternative: Vitest is excellent for pure TypeScript packages but not the default for Expo native mocks. Footgun: keep shared package tests in Vitest and app tests in Jest rather than forcing one runner everywhere.

Use **Maestro 2.1.1** for early end-to-end smoke tests. It runs at the accessibility layer, supports React Native, and does not require heavy app instrumentation ([Maestro React Native docs](https://docs.maestro.dev/platform-support/react-native)). Alternative: Detox 20.51.1 is powerful but more brittle and expensive to maintain for an Expo app. Footgun: Expo Go cannot launch with a custom app ID in Maestro; use development or preview builds.

Use **Vitest 4.1.5** for shared, API, and worker unit tests. It is fast and fits TypeScript server code. Alternative: Jest everywhere is simpler on paper but slower and less pleasant for Node ESM code.

### API Runtime

Use **Vercel Functions on the Node.js runtime** with **Vercel CLI 53.3.2** and **@vercel/node 5.7.17**. The API should start as plain request handlers with explicit JSON validation. Vercel supports TypeScript/JavaScript functions in an `api` directory on the Node runtime ([Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js/)). Alternatives: Next.js route handlers add app framework weight the project does not need; Edge Functions may be too constrained for Supabase/LLM calls; a long-running server is premature. Footgun: serverless timeouts and cold starts are real; compare requests must stay under the spec's under-2-second target by batching deterministic matching and using LLM fallback rarely.

Use **Hono 4.12.18** if routing grows beyond a couple of handlers. Adopt Hono once the API exceeds 6 endpoints or requires typed middleware. Hono gives a small, typed request layer without committing to tRPC or Next.js. Alternative: plain Vercel handlers are best at the start; tRPC is nice for web apps but less useful across a mobile app/API boundary where explicit JSON contracts are valuable. Footgun: do not let framework abstractions hide status codes and privacy behavior.

Use schema validation with **Zod** once implementation starts, even though it is not one of the listed minimum tools. Request validation is non-negotiable because the mobile app is untrusted and all sensitive logic stays server-side.

### Database Access And Migrations

Use **Supabase CLI 2.98.2**, **@supabase/supabase-js 2.105.4**, and Supabase-managed Postgres. The CLI supports local development, migrations, generated TypeScript types, and running the full local stack; Supabase documents Docker-compatible runtime requirements and recommends local dev for privacy and testability ([Supabase local development](https://supabase.com/docs/guides/local-development), [Supabase CLI docs](https://supabase.com/docs/guides/local-development/cli/getting-started)). Alternative: raw hosted Postgres would reduce platform features but increase glue work. Footgun: Supabase CLI via npm/npx requires Node 20+ and global npm install is not supported by the docs.

Use **Drizzle ORM 0.45.2** with **drizzle-kit 0.31.10** for server-side SQL if the schema becomes complex. For the mobile app, use Supabase only through the API; do not expose price/matching tables directly. For admin/workers, Drizzle gives typed SQL without Prisma's heavier runtime. Alternatives: Prisma 7.8.0 is mature but can be awkward in serverless and with pgvector/custom SQL; Kysely 0.29.0 is excellent SQL builder but leaves more migration/type generation decisions to the team; Supabase client alone is fine for simple CRUD but weak for complex joins and ranking. Footgun: keep RLS policies even if most access is via service-role server code; never ship service role keys to mobile.

### Vector Search

Use **pgvector in Supabase Postgres** for canonical product and query embeddings. Supabase lists pgvector as a supported Postgres extension for similarity search ([Supabase Postgres extensions](https://supabase.com/features/postgres-extensions)). This is the right first choice because BasketGap already needs relational joins across canonical products, retailer SKUs, zones, price observations, promotions, and freshness. Alternatives: Pinecone/Weaviate/Qdrant can scale independently but add a second datastore and consistency surface; local vector search is not appropriate for server-side matching. Footguns: choose embedding dimensions before indexing, use approximate indexes only after enough data exists, and keep deterministic filters/ranking ahead of vector similarity.

### LLM Routing

Use **OpenRouter** as the LLM gateway with the **OpenAI SDK 6.37.0** or **@openrouter/sdk 0.12.35**. OpenRouter provides an OpenAI-compatible API to many models and normalized schemas ([OpenRouter docs](https://openrouter.ai/docs/), [OpenRouter API overview](https://openrouter.ai/docs/api-reference/overview/)). For BasketGap v1, the recommendation is **Primary: `openai/gpt-4o-mini` via OpenRouter with the model ID pinned** and **Fallback: `google/gemini-2.0-flash-001` via OpenRouter with the model ID pinned**. Remove Claude Haiku from v1: it is too expensive and capability-heavy for fallback-only use, and should be revisited only if both GPT-4o mini and Gemini 2.0 Flash prove insufficient on real Australian shorthand. This matches the spec: matching is deterministic-first, the LLM only fires on roughly 10-15% of input lines, and cheap, fast structured-extraction models are the correct tool for that narrow fallback path. Do not use `latest` aliases in production without fixture regression tests.

Avoid **LangChain 1.4.0** for the v1 matcher. It is useful for complex agent/RAG workflows, but the spec calls for a deterministic, debuggable pipeline with a small LLM fallback. Avoid self-hosted LiteLLM unless vendor control or cost accounting becomes a major issue. Footguns: gateway routing can hide provider outages and pricing changes; log model ID, provider, latency, token counts, confidence, and fallback reason without logging raw shopping lists.

### Embeddings

Use **OpenAI `text-embedding-3-small`** initially. It is cheap, stable, 1536-dimensional, and supported by OpenAI's embeddings endpoint; OpenAI describes it as the improved small embedding model and lists low per-token pricing ([OpenAI embedding model docs](https://platform.openai.com/docs/models/text-embedding-3-small)). Alternatives: **Voyage 3.5 / 3.5-lite** may offer stronger retrieval/cost trade-offs and flexible dimensions ([Voyage 3.5 announcement](https://blog.voyageai.com/2025/05/20/voyage-3-5/)); **Cohere embed-v4.0** supports flexible dimensions and multimodal inputs ([Cohere embed docs](https://docs.cohere.com/docs/cohere-embed)). For v1 typed lists, OpenAI small is the least operationally surprising. Footgun: changing embedding dimensions later requires re-embedding and index rebuilds; benchmark with Australian grocery synonyms before committing.

### Scraping And Refresh Workers

Use **Node.js 24**, **tsx 4.21.0**, native `fetch` first, **cheerio 1.2.0** for HTML parsing only when needed, and **Playwright 1.59.1** only for pages that require browser execution. This keeps nightly refresh cheaper and less fragile. Alternatives: Python scraping is strong but introduces another language/runtime; Puppeteer overlaps with Playwright but Playwright has better cross-browser ergonomics. Footguns: retailer endpoints may be reverse-engineered, rate-limited, blocked, or legally sensitive; keep adapters pluggable, throttle aggressively, identify freshness failures honestly, and never fabricate stock status.

### Job Scheduling

Use **GitHub Actions cron** for the first nightly baseline worker if volume is small and reliability requirements are modest. It is simple, visible, and cheap. Use **Vercel Cron Jobs** only for short HTTP-triggered tasks; Vercel supports cron jobs for Vercel Functions and config in `vercel.json` ([Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/)). Use **Supabase pg_cron + pg_net** for database-local maintenance or calling Supabase Edge Functions, not for complex scraping; Supabase documents `pg_net` and cron-style endpoint invocation ([Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)). Consider **Upstash QStash 2.10.1** when targeted refresh needs durable fan-out, retries, and delayed jobs. Footguns: Vercel cron is not a durable queue; GitHub cron can be delayed; Postgres cron should not become an application job runner.

### Observability

Use **Sentry React Native 8.11.0** for mobile crashes and errors; Expo documents Sentry integration and EAS dashboard visibility ([Expo Sentry guide](https://docs.expo.dev/guides/using-sentry)). Use **Vercel logs initially**, then add **Axiom** as the preferred log drain once production traffic starts; Axiom's Vercel integration captures request/function logs and deployment annotations ([Axiom Vercel docs](https://axiom.co/docs/apps/vercel)). Use **Better Stack** if uptime/on-call/status pages matter before log analytics ([Better Stack docs](https://betterstack.com/docs/)). Footgun: do not log shopping lists, raw LLM prompts, precise location, or preference details.

### Analytics

Use **PostHog React Native 4.45.0**, but configure it minimally and privacy-first. Track funnel events such as compare started/succeeded, unmatched count bucket, latency bucket, and result viewed; do not capture shopping list content. Expo documents PostHog among feature flag/experimentation tools compatible with Expo ([Expo feature flags](https://docs.expo.dev/guides/using-feature-flags)). Alternatives: Plausible is better for web analytics than mobile product analytics; Mixpanel is mature but heavier and more commercial; no analytics is privacy-clean but weakens validation. Footgun: analytics SDKs can accidentally collect device/user identifiers; review defaults before shipping.

Defer analytics entirely to v1.1 unless a specific funnel question is identified pre-launch. Privacy-first brand stance argues for conservative analytics adoption. Sentry crash reporting is sufficient operational observability for v1.

### Code Quality

Use **ESLint 10.3.0** with flat config, **Prettier 3.8.3**, **Husky 9.1.7**, and **lint-staged 17.0.4**. ESLint v10 removed eslintrc and fully committed to flat config, so new projects should start there ([ESLint v10 release](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/)). Alternative: **Biome 2.4.15** is fast and tempting, but React Native/Expo linting still benefits from ESLint's ecosystem. Footgun: do not run expensive full test suites in pre-commit; reserve those for CI.

### CI

Use **GitHub Actions**. It should run pnpm install with a frozen lockfile, lint, typecheck, unit tests, and basic Expo/Vercel/Supabase config checks. Alternatives: Vercel CI is deployment-oriented; EAS Workflows can run mobile E2E later but is not the general repo CI replacement. Footgun: split mobile EAS build jobs from every-PR checks until build minutes and signing are configured.

### Mobile Build And Distribution

Use **EAS CLI 18.11.0**, **EAS Build**, and **EAS Submit**. This is the Expo-native route to TestFlight/App Store and Google Play, with development builds for SDK 55. Alternatives: local Xcode/Gradle builds are useful for debugging but should not be the release pipeline; fastlane is powerful but redundant at v1. Footguns: Apple Developer Program setup, bundle IDs, privacy manifests, app privacy nutrition labels, and Australian region availability should be prepared early.

## Section 2 — Coming Soon

- **Expo SDK 56 is expected in Q2 2026, likely May or June.** Expo's SDK 55 changelog says SDK 56 will include React Native 0.85 and is coming in Q2. This is confirmed by Expo's own changelog, but exact stable timing may move ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)).
- **React Native 0.85 is already released upstream but not yet the stable Expo SDK baseline.** React Native 0.85 shipped April 7, 2026 with the new animation backend and other improvements. BasketGap should not jump to bare RN 0.85 unless Expo SDK 56 stabilizes before implementation starts ([React Native 0.85 release](https://reactnative.dev/blog/2026/04/07/react-native-0.85), [RN versions](https://reactnative.dev/versions)).
- **Expo SDK 55 has active transition issues around Expo Go and New Architecture.** Expo's changelog notes Expo Go store transition lag and recommends development builds; this is confirmed. The practical recommendation is to avoid depending on Expo Go for team testing ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)).
- **TypeScript 7's Go-based compiler line is coming after TypeScript 6.0.** Microsoft says TypeScript 6.0 is intended to be the last release based on the current JavaScript codebase. This is confirmed direction, but not a reason to adopt prerelease TS 7 for BasketGap ([TypeScript 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)).
- **Supabase extension and CLI versions move quickly.** Supabase CLI 2.98.2 was the latest GitHub release found during research, and the docs warn about local stack/CLI behavior. Pin the CLI and update intentionally rather than casually ([Supabase CLI GitHub release listing](https://github.com/supabase/cli), [Supabase CLI docs](https://supabase.com/docs/guides/local-development/cli/getting-started)).
- **OpenRouter model catalog changes continuously.** The live model API currently exposes newer Flash/Haiku-style model IDs and `latest` aliases. This is confirmed by the API but production use is speculative until BasketGap runs extraction fixtures against them ([OpenRouter models/API docs](https://openrouter.ai/docs/api-reference/overview/)).
- **Australian supermarket data access may change.** The ACCC supermarkets inquiry has examined competition, pricing, and recommendations around grocery data transparency; there is no confirmed official Coles/Woolworths pricing API for BasketGap to use today. Treat any future official feed as speculative until a binding implementation exists ([ACCC supermarkets inquiry](https://www.accc.gov.au/inquiries-and-consultations/supermarkets-inquiry-2024-25), [ACCC food and groceries](https://www.accc.gov.au/by-industry/food-and-groceries)).
- **Embedding provider rankings may shift.** Voyage and Cohere are actively improving retrieval models. This matters because BasketGap's vector layer is foundational; benchmark before committing to a long-lived embedding dimension ([Voyage 3.5 announcement](https://blog.voyageai.com/2025/05/20/voyage-3-5/), [Cohere embed docs](https://docs.cohere.com/docs/cohere-embed)).

## Section 3 — Plugins And Integrations Available Today

### Expo Plugins And Native Modules

- **expo-dev-client**: use for development builds, especially because SDK 55 is not a good Expo Go dependency. Do not skip it if testing on real iPhones.
- **expo-secure-store**: use for anonymous device ID and optional restore token. Do not store shopping lists, raw prompts, or server secrets.
- **expo-application**: use only if install/build metadata is needed for diagnostics.
- **expo-location**: use only for optional postcode detection. Do not require location permission for v1.
- **expo-updates**: use after release discipline exists. Do not ship over-the-air changes that alter price/matching semantics without server compatibility.
- **expo-splash-screen / expo-font**: use for polish. Keep branding calm; avoid turning v1 into a landing page.
- **Sentry Expo/React Native integration**: use for crashes and release health. Do not enable session replay or breadcrumbs that capture shopping text until privacy review.
- **PostHog React Native**: use for privacy-reviewed funnel analytics and feature flags. Do not autocapture text input.

Avoid camera, image picker, barcode scanner, media library, and OCR modules in v1 because the decisions log says no photos.

### Supabase Extensions

- **pgvector**: use for product/query embeddings and semantic candidate retrieval.
- **pg_cron**: use for DB-local maintenance and small scheduled SQL tasks; not the main scraping scheduler.
- **pg_net**: use with pg_cron to call HTTP endpoints from Postgres when useful; watch response retention and throughput limits ([Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)).
- **pg_stat_statements**: use for query performance tuning once compare/matching queries exist.
- **pg_trgm**: use for deterministic fuzzy text matching before vector fallback.
- **unaccent**: consider for text normalization, though Australian grocery inputs are mostly ASCII.
- **uuid-ossp or pgcrypto**: use for IDs/secrets depending on schema conventions.

### VS Code Extensions

- **ESLint**: required for flat-config lint feedback.
- **Prettier**: required for format-on-save.
- **TypeScript and JavaScript Language Features**: built in; use workspace TypeScript.
- **Expo Tools**: useful for Expo config, commands, and app workflow.
- **React Native Tools**: useful if debugging directly from VS Code.
- **Supabase**: useful for local/project visibility where available.
- **PostgreSQL / SQLTools**: useful for inspecting local Supabase Postgres.
- **GitHub Actions**: validate workflow YAML.
- **DotENV**: env file syntax.
- **Error Lens**: optional, improves feedback but can be noisy.

### Codex/Agent Skills

- **Build iOS Apps / ios-debugger-agent**: use when running or debugging the Expo iOS app in simulator once the app exists.
- **Vercel / nextjs / vercel-functions / cron-jobs / deployments-cicd**: use for API deployment, function behavior, and cron config.
- **Vercel / agent-browser-verify or browser-use**: use for local web/API verification where applicable.
- **Codex Security / security-scan**: use before handling real preference data or retailer adapter secrets.
- **Spreadsheets/Documents**: useful only for external planning artifacts, not app implementation.
- **GitHub / gh-fix-ci / yeet**: use for PRs, CI failures, and publishing changes.

## Section 4 — Decision Points I Need To Make

- **pnpm-only scripts vs Turborepo**: default to pnpm-only. Choose Turborepo if CI time or package graph complexity becomes painful.
- **Expo SDK 55 now vs wait for SDK 56**: default to SDK 55 if building tomorrow. If implementation starts after SDK 56 stable and ecosystem smoke tests pass, start on SDK 56.
- **Expo Router vs direct React Navigation**: default to Expo Router. Choose direct React Navigation only if route files feel too implicit for the team.
- **Plain React Native styling vs NativeWind vs Tamagui**: default to plain React Native plus local primitives. Choose NativeWind only for a utility-class team; do not choose Tamagui until stable unless cross-platform design system needs dominate.
- **TanStack Query vs plain fetch**: default to TanStack Query for compare/result server state. Plain fetch is acceptable for the very first prototype but should not survive production.
- **Zustand vs no client store**: default to no store until navigation/draft state requires it, then Zustand. Do not persist grocery lists.
- **Supabase client vs Drizzle vs Prisma/Kysely**: default to Supabase CLI/migrations plus Drizzle for server-side DB access. Use raw SQL for vector/ranking hot paths. Avoid Prisma unless the schema becomes CRUD-heavy and vector work is isolated.
- **OpenRouter vs direct providers**: default to OpenRouter for fallback LLM routing. Choose direct OpenAI/Google/Anthropic if OpenRouter reliability, privacy, or pricing becomes a concern.
- **OpenAI embeddings vs Voyage/Cohere**: default to OpenAI `text-embedding-3-small`. Benchmark Voyage 3.5-lite before scaling catalogue embeddings.
- **GitHub Actions cron vs Vercel cron vs QStash**: default to GitHub Actions for nightly baseline and QStash later for targeted fan-out. Use Vercel cron only for short HTTP triggers.
- **Sentry plus PostHog vs Sentry only**: default to Sentry only for v1. Add PostHog in v1.1, or earlier only if a specific pre-launch funnel question justifies it.
- **Maestro vs Detox**: default to Maestro for E2E smoke. Choose Detox only for deeper deterministic native flows after the app stabilizes.

## Section 5 — Risks And Unknowns

- **Retailer data access is the largest tooling risk.** Coles/Woolworths data may require reverse-engineered endpoints, browser automation, or changing adapters. This affects worker runtime, scheduling, legal review, rate limits, and freshness guarantees.
- **Official grocery data regulation is uncertain.** The spec mentions a future ACCC-mandated API, but no production-ready official feed was confirmed during this research.
- **SDK 55 vs SDK 56 timing could change the mobile baseline.** SDK 55 is stable today, but SDK 56 is close enough that starting a build next month may justify re-checking.
- **OpenRouter's catalog is dynamic.** Model IDs, providers, prices, and health can change. Pin IDs, keep fixture tests, and avoid `latest` aliases for production extraction.
- **LLM privacy needs implementation discipline.** The plan says shopping lists are not stored; sending lines to LLM providers still counts as processing user content. Use deterministic matching first, redact where possible, and document provider data retention.
- **Embedding model changes are expensive after launch.** A dimension/model change means catalogue re-embedding and index migration.
- **Serverless time limits may clash with targeted refresh.** Vercel Functions are good for API requests, not long scraping jobs. Keep workers separately deployable.
- **Mobile analytics can violate product tone/privacy if overused.** Track only operational/product events, not grocery content.
- **Australia-specific App Store and Play Store compliance still needs review.** Price comparison claims, privacy labels, optional location permission wording, and consumer-law-sensitive phrasing should be reviewed before release.
- **Supabase local/remote drift is common.** Require migrations, generated types, and CI checks before production data exists.

## Top 10 Recommendations

1. Use Node.js 24 LTS with pnpm 11 workspaces; keep Turborepo optional until CI caching matters.
2. Start on Expo SDK 55, but re-check SDK 56 if the actual build starts later.
3. Use plain React Native styling plus a tiny local design system for the Notes-app feel.
4. Choose Expo Router over raw React Navigation for the app's shallow flows.
5. Use TanStack Query for server state and Zustand only if local draft/navigation state needs it.
6. Use Jest/jest-expo for mobile tests, Vitest for shared/API/workers, and Maestro for E2E smoke tests.
7. Keep API handlers plain Vercel Node Functions at first; add Hono once the API exceeds 6 endpoints or requires typed middleware.
8. Use Supabase Postgres + pgvector, with Drizzle for server-side SQL once schema complexity justifies it.
9. Use OpenRouter with pinned model IDs: GPT-4o mini primary and Gemini 2.0 Flash fallback; keep Claude Haiku out of v1 unless real shorthand tests prove both cheaper models insufficient.
10. Use GitHub Actions cron first for nightly refresh; add QStash later if targeted refresh fan-out needs durability.
