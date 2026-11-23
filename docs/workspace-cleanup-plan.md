# Workspace cleanup plan

## Review — 2026-11-23

The product goal is a trustworthy comparison of a shopper's list using available retailer offers. The mobile app defaults to synthetic offline data and has an opt-in offers mode. Local tests cover the mobile client and keyless match route with synthetic offers.

The remaining work should be ordered by customer impact:

1. Verify one complete basket on a device against freshly imported data before claiming production readiness. Use the public file import and enrichment commands.
2. Correct per-line LLM truncation reporting: reaching the basket-wide cap does not prove an earlier declined match was truncated.

Batching, vector-search shortcuts, new size abstractions, and another enrichment cron are not established launch requirements. Add them only when measured latency, repeated complexity, or a demonstrated freshness gap justifies them.

The low-confidence cache safeguards and truthful eval IDs remain useful correctness boundaries. The standalone API server and offline playground serve different verification tasks and are not duplicate applications. No new runtime abstraction or automation is needed for this review.

Evidence: `packages/api/src/routes/match.ts`, `packages/api/src/middleware/rate-limit.ts`, `packages/api/src/lib/llm-cap.ts`, `packages/api/src/__tests__/app.test.ts`, `packages/api/src/__tests__/security.test.ts`, `packages/mobile/src/mock/`, and `docs/ingest-cadence.md`.
