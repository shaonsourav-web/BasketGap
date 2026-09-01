# Workspace cleanup plan

Audit date: 2026-08-24. Scope: the BasketGap pnpm monorepo and its three projects (`api`, `shared`, and `workers`), plus repository infrastructure.

## Classification

| Project              | State                            | Evidence                                                                                                                                               |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@basketgap/shared`  | Active, partly unfinished        | Matching engine and 200-line eval are healthy; multipack output, basket batching, and production catalogue breadth remain unfinished.                  |
| `@basketgap/workers` | Active, operationally unfinished | Four adapters, seed, and enrichment commands exist; live seed/ingest/enrich and a scheduled enrichment workflow have not been completed.               |
| `@basketgap/api`     | Active, product-blocked          | Security and request plumbing exist, but the response does not yet aggregate retailer prices. Upstash failure policy and deployment remain unresolved. |
| Repository/CI        | Active, cleanup needed           | Seven commits are ahead of `origin/main`; production secrets and deployment are owner-controlled. Documentation and a few local artifacts had drifted. |

No abandoned project or duplicated source tree was found. The only true duplicate was an ignored `.claude/settings.local.json.` copy. The empty `packages/workers/drizzle/` directory, dead workers `src/index.ts`, and an untracked macOS backup were stale artifacts rather than active work.

## Priority plan

### P0 — block production

1. Add a price-aggregation boundary to `/api/match`: for each accepted canonical product, return current Coles and Woolworths observations for the requested postcode/zone. Specify and test behavior for missing/stale prices.
2. Decide and test the rate-limit failure policy. The current implementation fails open when Upstash configuration or calls fail, so it does not satisfy the documented “every request is rate-limited” claim.
3. Bootstrap production data in order: canonical seed → four live ingesters → SKU enrichment → re-embedding/index tuning. Verify the API against real retailer observations.
4. Configure Vercel/Upstash/secrets/cost caps, preview-test, then deploy. Push the seven local commits and verify CI only with owner approval.

### P1 — finish before customer launch

1. Add a scheduled `enrich-skus` workflow and alerting.
2. Return extracted multipack quantity and use it when pricing pack requests.
3. Batch basket embeddings/queries and short-circuit vector search after exact direct hits.
4. Fix LLM-cap truncation accounting so only rejected calls mark an individual result truncated.
5. Remove or implement the currently accepted-but-unused `postcode` behavior as part of price aggregation.

### P2 — maintainability

1. Deduplicate the repeated popularity subquery/row mapping in matching DB loaders when that area is next changed.
2. Introduce a shared nullable size value object if size handling expands further.
3. Use the repository-pinned Node 24 locally; Node 26 currently works but emits engine warnings.

## Safely completed in this pass

- Prevented `needs_attention` matches from exposing or caching a canonical ID, and ignored stale low-confidence cache records.
- Made the eval harness inspect the real returned ID instead of masking leaks.
- Added an explicit prompt-injection boundary for shopping-list text.
- Restored Sentry's documented no-op behavior when no DSN is configured.
- Removed the stale backup, exact ignored settings duplicate, empty Drizzle directory, and dead workers placeholder entrypoint.
- Added the standalone API development command and explicit Vercel framework setting.
- Updated Hono, its Zod validator, Sentry, and Upstash; pinned patched transitive `undici` and `brace-expansion`. The production audit now reports no known vulnerabilities and peer checks are clean.
- Updated README, agent commands, schema path, and Round 8.5 status to match the repository.
