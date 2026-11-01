# Workspace cleanup plan

## Review — 2026-09-05

The product goal is a trustworthy comparison of a shopper's list using available retailer offers. The API now attaches offers and resolves postcode to state; production rate limiting rejects requests when its required limiter is absent. The mobile package is in progress and still uses offline mock comparison data. Live data freshness, deployment state, and end-to-end correctness require separate verification; local source inspection cannot establish them.

The remaining work should be ordered by customer impact:

1. Connect the mobile comparison flow to the real offers response, specifying quantity handling, comparable totals, missing prices, and stale or unavailable offers. A missing offer must never count as a zero price.
2. Verify one complete basket against current retailer data through the supported capture/ingest/enrich path before claiming production readiness.
3. Correct per-line LLM truncation reporting: reaching the basket-wide cap does not prove an earlier declined match was truncated.

Batching, vector-search shortcuts, new size abstractions, and another enrichment cron are not established launch requirements. Add them only when measured latency, repeated complexity, or a demonstrated freshness gap justifies them. The current capture runbook already includes enrichment.

The low-confidence cache safeguards and truthful eval IDs remain useful correctness boundaries. The standalone API server and offline playground serve different verification tasks and are not duplicate applications. No new runtime abstraction or automation is needed for this review.

Evidence: `packages/api/src/routes/match.ts`, `packages/api/src/middleware/rate-limit.ts`, `packages/api/src/lib/llm-cap.ts`, `packages/api/src/__tests__/app.test.ts`, `packages/api/src/__tests__/security.test.ts`, `packages/mobile/src/mock/`, and `docs/ingest-cadence.md`.
