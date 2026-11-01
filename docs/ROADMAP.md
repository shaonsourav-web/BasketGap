# Roadmap

Last reviewed: 2026-11-01. BasketGap is pre-release: there are no tagged releases, no verified production deployment, and no users to speak of. This roadmap lists what exists, what is planned, and what the project will not do. It has no dates because none are promised.

Sources: [workspace cleanup plan](./workspace-cleanup-plan.md), the [specification](../BasketGap.md), the [README](../README.md) status section, and the [decisions log](./decisions.md).

## Principles the app commits to

These are product rules, not marketing. A change that breaks one of them is a bug.

1. **Like-for-like totals.** A total only adds up items that have a listed price at every store being compared. An item priced at one store only is left out of both totals and shown as such, so the two numbers are always comparable.
2. **A missing price is never zero.** "No special listed" is a distinct state. It is never rendered or summed as `$0.00`.
3. **Say what the numbers cover.** The results screen must prominently show which retailers are compared, where the prices come from (published catalogue promotions, not full shelf prices), and when they were last updated. Sample or mock data must say so on screen.
4. **State the difference, never recommend.** The app says "Coles lower by $X on the items counted". It does not tell anyone where to shop.
5. **Uncertainty is shown, not hidden.** Each line is labelled `matched`, `assumed` or `needs_attention`. Lines the engine is unsure about are surfaced rather than guessed.
6. **No retailer content in the repository.** No catalogue PDFs, screenshots, product images, logos or real price dumps. Test data is synthetic. See [CONTRIBUTING.md](../CONTRIBUTING.md).
7. **Independence.** BasketGap is not affiliated with, endorsed by or sponsored by Coles Group or Woolworths Group.

## What works now

Everything below runs locally. None of it has been verified against a live production deployment.

- **Deterministic matching engine** (`packages/shared/src/matching/`). Clean, spell-correct, shorthand and Aussie slang expansion, quantity and size extraction, trigram lookup, optional embedding search, a weighted ranker, an optional LLM fallback that may only choose from a shortlist or decline, and a postcode-independent cache. With no API keys it runs fully offline and deterministically.
- **Eval harness with recorded accuracy** (reproduced locally on 2026-11-01):
  - In-house labelled set, 200 lines: 99.5% overall accuracy, one known false negative (`bbq snags 500g`). `pnpm --filter @basketgap/shared test:eval`.
  - Three blind gold sets written by other models from the seed file only (426, 300 and 250 lines): 0 wrong picks on in-catalogue lines in all three. Correct-match rates of 99.5%, 98.3% and 98.0%. The 426-line set also records 9 false accepts on out-of-catalogue lines (accepted precision 97.6%), mostly bare generic words like "coffee" that the engine resolves to a documented default. The other two sets record none.
  - **Caveat:** all of these are scored against the built-in catalogue of 152 hand-written staple products, with an in-memory approximation of Postgres trigram similarity. They show the deterministic path is careful on that catalogue. They are not a measure of accuracy on a real, much larger product catalogue.
- **API** (`packages/api`). `POST /api/match` takes 1 to 100 lines of up to 200 characters, enforces a 32 KB body limit, returns request IDs, applies CORS and a per-request cap on LLM calls, and attaches retailer offers to matched lines. Offers degrade to `null` rather than failing the request when the offers query is down.
- **Rate limiting.** Sliding-window limiting through Upstash Redis, keyed on the client IP hash alone. In production the API answers `503` if no limiter is configured, instead of serving unlimited traffic. Tests cover this in `packages/api/src/__tests__/security.test.ts`.
- **Ingestion workers** (`packages/workers`). The built-in `import` adapter (a local JSON or CSV file in a documented format), the adapter kit and plugin loader (`BASKETGAP_INGEST_PLUGINS`), a canonical product seed, SKU enrichment, and match-cache pruning. Retailer-specific adapters are not part of this repository: they live in a separate private plugin outside it, and this repository ships no retailer ingest schedule. See [ingest-adapters.md](./ingest-adapters.md) and [ingest-cadence.md](./ingest-cadence.md).
- **Offline mock mobile app** (`packages/mobile`). Expo and TypeScript, six screens covering the guest flow (postcode, list, totals, all items, split basket, unmatched lines). Every figure comes from a deterministic mock with invented products and prices. It does not call the API.

## What is next

Roughly in priority order, taken from the [cleanup plan](./workspace-cleanup-plan.md). None of this is done.

1. **Connect the mobile app to the real offers response.** Specify and implement quantity handling, comparable totals, missing-price handling, and stale or unavailable offers. A missing offer must never count as a zero price. The mock and live behaviour are not yet shown to be equivalent.
2. **Verify one full basket against current data through a lawful data path.** Before any claim of production readiness, run one complete basket through ingest and enrichment against current data and check the result by hand. This repository ships only the `import` adapter, which reads files you are entitled to share, and the plugin loader; retailer-specific adapters live in a separate private plugin outside it. This repository does not establish that any retailer data source is permitted, and the checklist item "Legal/ToS sanity check on scraping Coles/Woolies catalogues" in [round-8.5-engine-hardening.md](./round-8.5-engine-hardening.md) is still unchecked. Resolving that is part of this item.
3. **Fix per-line LLM truncation reporting.** In `packages/api/src/routes/match.ts`, a line is flagged `truncated` when the request's LLM cap has been reached by the end. That does not prove an earlier line that the model declined was cut short. The flag should be set per line, only for lines that were actually denied an LLM call by the cap.
4. **Retailer-neutral data import.** The documented CSV and JSON `import` adapter and the plugin loader exist in `packages/workers` (see [ingest-adapters.md](./ingest-adapters.md)), so the catalogue and price pipeline does not depend on any one retailer's pages or file formats. It has not been released or verified against live data.
5. **Broaden the canonical catalogue.** The engine is tested against 152 hand-written staples. Real breadth is an open item in the round 8.5 checklist.
6. **Accessibility pass on the mobile app.** Screen-reader labels and roles, grouped rows, and announcing which store is lower, not only colouring it. See [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md) for starting points.
7. **Launch checks that need real infrastructure.** Deployment environment variables, live rate-limit behaviour, provider spend ceilings, and error reporting have not been verified in production.
8. **Sign in with Apple, only if accounts are added.** v1 has no accounts and no login, so no sign-in SDK is added. If a later version adds a third-party sign-in such as Google, Apple's rules require Sign in with Apple alongside it. See [ios-approval-and-security.md](./ios-approval-and-security.md).

## Explicitly out of scope

- **No shelf-price scraping in v1.** Prices come from published weekly catalogue promotions only. They are not full shelf prices and not every product has one.
- **No ordering, checkout or delivery.** BasketGap compares; it does not sell.
- **No affiliation.** No partnership, endorsement or sponsorship with Coles or Woolworths, and no use of retailer logos, brand colours as identity, or product images.
- **No ads, upselling or store recommendations.** The app states both totals and the difference.
- **No mandatory login or accounts in v1.** Postcode only. No receipts, photos of lists, recipes or social features.
- **No member or loyalty-card pricing in v1.**

## A note on the specification

[BasketGap.md](../BasketGap.md) is the original product specification. It describes a broader v1 than what is being built: standard shelf prices, nightly refresh, and a personalisation layer in v1.1. The current direction is narrower and is the one described above and in the README: catalogue promotions only, weekly ingest, and honest disclosure of that limit. The specification has not been rewritten to match, so where they differ, this roadmap and the README are current.
