# BasketGap Round 8.5 — Engine Hardening, Measurement & Production Readiness

## Context

When this plan was written, Round 8 (Vercel-hosted `/match` API) was built and green locally but uncommitted and undeployed. A deep review of the matching engine — the product's core value — found it roughly **4–5/10 for production**: the architecture was sound (deterministic-first, hybrid trigram+vector, strict LLM containment, auditable), but the _effective_ quality was far below what its confidence labels implied.

The user's priority is explicit: **quality before deploy**, and **"super easy to use, customer satisfaction is the utmost priority."** The worst customer experience is typing a normal grocery item and getting silence / `needs_attention`. So we do **Round 8.5 (engine hardening + a way to measure quality + a real catalogue)** _before_ committing and deploying Round 8.

This plan is the pre-production checklist the user asked for: every fix, every data step, every secret, sequenced.

## Verified current state (facts, not assumptions)

- **Audit update, 2026-08-24:** Round 8/8.5 is now split across seven local commits ahead of `origin/main`; it remains unpushed and undeployed.
- Before the cleanup pass, `pnpm -r typecheck | lint | test` and `pnpm format:check` all passed (262 passing, 18 conditionally skipped tests across shared, workers, and API).
- `workers→shared` refactor is **clean** — no dangling imports, no leftover copies.
- **No `.vercel/` link**, no Upstash, no env in Vercel — not deployed.
- **The database ships empty** — no canonical seed loaded, no specials ingested, no SKUs enriched. `/match` returns `needs_attention` for everything until the data pipeline runs.
- **The API response has no retailer-price aggregation yet.** Even with populated data, `/api/match` currently returns canonical-match metadata rather than the Coles/Woolworths comparison promised by the product flow.
- API DB client is `postgres(url, { prepare: false, max: 1 })` — correct for serverless + Supabase pooler.
- Ingest crons (`ingest-*.yml`) run Tue/Wed AU time and read `secrets.DATABASE_URL` + `secrets.SENTRY_DSN`. **No `enrich-skus` cron exists.**

---

## Engine defects found (evidence-backed)

| #   | Defect                                                                                                                                                   | File                                               | Impact                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| 1   | **Cache key drops size** — hashes size-stripped residual, so "milk 1L"/"2L"/"3L" collide to one entry; first result served for all                       | `steps/09-cache.ts`, `pipeline.ts:28-29`           | Correctness bug — wrong prices returned                       |
| 2   | **Shorthand duplication** — "full cream milk" → "full cream milk **milk**", "skim milk" → "skim milk milk"                                               | `steps/03-shorthand.ts`                            | Degrades the trigram score it feeds                           |
| 3   | **Brand signal is dead** — pipeline hardcodes `brand: null`; no step extracts brand                                                                      | `pipeline.ts:48,60`, `steps/01-clean.ts`           | 0.10 of ranker weight always 0; "Bega cheese" undiscriminated |
| 4   | **Popularity signal is dead** — `popularityPrior` never populated                                                                                        | `steps/07-rank.ts`, `db.ts`                        | Another 0.10 of weight always 0                               |
| 5   | **No unit conversion** — `computeSizeMatch` requires exact UoM string; "500g" vs "0.5kg" → 0                                                             | `steps/07-rank.ts:69`, `steps/04-quantity-size.ts` | Size signal silently zeroes on equivalent sizes               |
| 6   | **Multipack quantity discarded** — extracted then never passed to ranker                                                                                 | `pipeline.ts:60`, `steps/04`                       | "24 pack", "1 dozen" intent lost                              |
| 7   | **Boost-ladder is the real classifier** — with 20% weight dead, max weighted sum ≈ 0.80; **with no embeddings key, weighted path can't reach `assumed`** | `steps/07-rank.ts`, `types.ts`                     | Bands are hand-tuned constants, unvalidated                   |
| 8   | **Toy catalogue** — 152 rows, 7 branded, whole aisles missing; ivfflat `lists=100` mis-tuned for 152 rows                                                | `seed/canonical-seed.ts`, migration                | Most branded/specialty items → no match                       |
| 9   | **Typo table** — 46 exact-match entries + dead `bred_loaf` key; no fuzzy                                                                                 | `dictionaries/typos.ts`                            | Decorative; real tolerance comes from pg_trgm                 |

---

## Part A0 — Documentation first

First execution step: copy this plan into the repo as `docs/round-8.5-engine-hardening.md` so the repo stays the source of truth (same pattern as `docs/round-8-api-vercel.md` and every prior round). Keep it updated as gates complete.

## Part A — Engine fixes (do these first)

Ordered by leverage. Each is small and testable in isolation.

1. **Fix cache key (defect 1).** Hash a variant-complete key: `residual + '|' + sizeValue + sizeUom + quantity` (or hash `expanded` pre-strip). Update `hashCleanedInput` call site in `pipeline.ts`. Add a regression test: "milk 1L" and "milk 3L" must produce different hashes / results.
2. **Fix shorthand duplication (defect 2).** In `expandShorthand`, when an expansion's tail already equals the next input token, don't re-emit it. Add tests for "full cream milk", "skim milk", "lite milk".
3. **Unit normalization (defect 5).** Normalize size to a base unit (g and mL) in `extractQuantitySize` (keep original for display), and compare on the base in `computeSizeMatch` so g↔kg and mL↔L reconcile. Tests: 500g↔0.5kg, 2000ml↔2L → `sizeMatch = 1`.
4. **Wire brand (defect 3).** Add lightweight brand extraction: match input tokens against a known-brand set **derived from the catalogue** (works well once catalogue is bootstrapped from real SKUs — see Part C). Pass extracted brand into `directLookup` and `rankCandidates` (replace the hardcoded `null`s). Tests: "Bega tasty cheese" ranks the Bega canonical above generic.
5. **Wire popularity (defect 4).** Populate `popularityPrior` in the candidate SQL (`db.ts`) from `match_cache.hit_count` (normalized), which already accrues on reads. Test: monotonicity — higher hit_count → higher prior.
6. **Use multipack quantity (defect 6).** Pass `quantity` into the result so the app can multiply prices; optionally factor into ranking for pack-sized canonicals. (Lower priority — mostly an app-layer/display concern.)
7. **Reweight + re-tune bands** _after_ 3–5 are live (so brand/popularity actually fire), validated by the eval harness (Part B) — do **not** hand-tweak thresholds blind.
8. **Performance / cost (for "super easy = fast"):** batch the per-line query embeddings across a basket instead of the serial loop in `matchBasket`; short-circuit vector search when direct lookup already returns an exact-name hit (saves an embedding call + latency per line).
9. **Offline recall (defect 9, plus the dictionary half of defect 8).** Grow `dictionaries/shorthand.ts` and replace exact-match-only typo correction with a bounded fuzzy corrector. Step-internal only — no step reordering, no `BAND_THRESHOLDS` / `RANK_WEIGHTS` change. **Done 2026-08-14** — see the after-table below.

## Part B — Measurement (the "how good is it" answer)

Build a small **eval harness** before touching thresholds: a labelled set of ~100–200 real messy AU shopping lines (staples, brands, private-label, typos, multipacks, slang) each mapped to the expected canonical. Report: precision within each band, `needs_attention` rate, and mismatch examples. This is what lets us _prove_ quality and calibrate the 0.80 / 0.55 cutoffs and boost ladder instead of guessing. Lives as a vitest fixture in `packages/shared/src/matching/__tests__/eval/`.

### Status: built (2026-08-14)

| File                                  | Role                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `__tests__/eval/labelled-lines.ts`    | 188 labelled lines (`{ line, expected, tags }`); data only — add lines without touching the runner |
| `__tests__/eval/offline-catalogue.ts` | In-memory 152-row catalogue from `CANONICAL_SEED` + the offline `PipelineContext`                  |
| `__tests__/eval/pg-trgm.ts`           | Offline re-implementation of PostgreSQL `pg_trgm similarity()`                                     |
| `__tests__/eval/harness.ts`           | Runner, scoring, `EvalReport`, formatted summary                                                   |
| `__tests__/eval/eval.test.ts`         | Vitest gate; prints the report on every `pnpm -r test`                                             |

Run focused: `pnpm --filter @basketgap/shared test:eval`.

### Baseline — 2026-08-14 (deterministic offline path, 188 labelled lines)

| Band              |   n | correct | precision |
| ----------------- | --: | ------: | --------: |
| `matched`         | 138 |     138 |    100.0% |
| `assumed`         |   5 |       4 |     80.0% |
| `needs_attention` |  45 |      19 |     42.2% |

- `needs_attention` rate: **23.9%** (45/188)
- Overall accuracy: **85.6%**
- In-catalogue recall: **84.0%** (142/169)
- Out-of-catalogue correctly deferred: **100%** (19/19) — the engine never invented an answer for an item the catalogue does not carry
- Mismatches: **27**, of which **26 are false negatives** (`needs_attention` on a line that has a catalogue answer) and **1 is a wrong pick** (`"laundry detergent liquid 2l"` → `Dishwashing Liquid`, `assumed` 0.60)

Reading of the baseline: with no embeddings key the vector component (0.30 of the weight) and the popularity prior (0.10) are both zero, so scores come from the trigram + size + brand terms and the boost ladder. That makes the engine **conservative, not wrong** — 100% precision in `matched`, but every miss is silence. The false negatives cluster exactly where the doc predicted: unexpanded slang/abbreviation (`fc milk`, `evoo`, `coke`, `cuppa`, `tim tams`, `chook breast`, `rump`, `rashers`), fuzzy typos outside the 46-entry table (`bannanas`, `red onoins`, `chese`), and short/vague heads whose trigram overlap with a longer canonical name is low (`milk 1L`, `macaroni`, `lentils`, `bred`). Cheapest wins in order: grow `dictionaries/shorthand.ts`, replace exact-match typos with fuzzy correction, then re-measure before touching `BAND_THRESHOLDS`.

**This table is the gate.** Re-run the harness after any threshold/weight change and compare; do not tune blind.

### After A9 — dictionary growth + fuzzy typo correction (2026-08-14)

Two step-internal changes, no reordering, no `BAND_THRESHOLDS` / `RANK_WEIGHTS` edit:

1. **`dictionaries/shorthand.ts` grown** (~80 → ~170 shorthand entries) and a second map added, `HEAD_DEFAULTS`, applied in step 03 only when the key is the **entire line** once trailing size/pack tokens are set aside ("milk 1L" → full cream; "almond milk" untouched).
2. **Step 02 made fuzzy** — the 46-entry exact table stays as a fast path, then a bounded Damerau–Levenshtein (OSA) pass corrects against a catalogue-derived vocabulary. ≤ 1 edit, ≤ 2 from 6 characters up, never below 4 characters, never a word already in the vocabulary, and **ties are refused** (two vocabulary words at the same distance ⇒ no correction).

12 labelled lines were added (188 → 200) documenting the new coverage, two known remaining false negatives and one ungrounded-slang deferral. No existing line was relabelled or removed.

| Band              | before (n / correct / precision) | after (n / correct / precision) |
| ----------------- | -------------------------------- | ------------------------------- |
| `matched`         | 138 / 138 / 100.0%               | 175 / 175 / **100.0%**          |
| `assumed`         | 5 / 4 / 80.0%                    | 3 / 3 / **100.0%**              |
| `needs_attention` | 45 / 19 / 42.2%                  | 22 / 20 / **90.9%**             |

| Metric                    |           before |               after |
| ------------------------- | ---------------: | ------------------: |
| labelled lines            |              188 |                 200 |
| overall accuracy          |        **85.6%** |           **99.0%** |
| in-catalogue recall       | 84.0 % (142/169) | **98.9%** (178/180) |
| `needs_attention` rate    |            23.9% |               11.0% |
| out-of-catalogue deferral | **100%** (19/19) |    **100%** (20/20) |
| wrong picks               |                1 |               **0** |
| false negatives           |               26 |               **2** |

The one wrong pick is gone: `"laundry detergent liquid 2l"` used to hit the unigram `detergent → dishwashing liquid`; the bigram `laundry detergent → laundry detergent liquid` now wins (longest n-gram first) and resolves it correctly.

**Remaining false negatives (2):**

- `"icecream 2l"` → expected `Vanilla Ice Cream`, scored 0.272. Needs compound-word splitting ("icecream" → "ice cream"), which the token-level corrector cannot do — the whole token is 8 characters from any single vocabulary word.
- `"bbq snags 500g"` → expected `Beef Sausages`, scored 0.356. "snags" correctly expands to "sausages", but choosing **beef** over **pork** sausages from the modifier "bbq" is a semantic call that only the vector path or the LLM fallback can make. Genuinely ambiguous offline.

Both are honest gaps kept in the labelled set so the harness still has something to fail on. Also worth noting: `"bega tasty 500g"` now resolves (`assumed`, correct product) only because the shorthand supplies the missing product words — the seed catalogue carries **no Bega brand row**, so the brand signal still does nothing here. That is defect 8 (toy catalogue), not a dictionary problem, and Part C fixes it.

## Part C — Catalogue strategy (specialist recommendation: **Hybrid**)

For "super easy to use + customer satisfaction," neither the 152-row toy (constant no-match) nor slow hand-curation is right. Recommendation:

- **Keep the 152 staple seed as an always-on floor** — everyday items (milk, bread, eggs, mince) always resolve even when not on special.
- **Bootstrap catalogue breadth from real ingested specials** — after running the 4 adapters against live Coles/Woolies sources, derive/augment `canonical_products` from real retailer SKU names (brands + private-label like "Coles", "Woolworths Essentials", "Macro" come for free). This makes the catalogue mirror what shoppers actually see on shelves, and it reuses the already-built `enrich-skus` machinery.
- Re-tune the ivfflat index (`lists`) once the catalogue exceeds ~1k embedded rows.
- **Graceful no-match UX** (app-layer note for the mobile round): when a line lands `needs_attention`, show "we couldn't match X — did you mean [nearest candidates]?" rather than silence. Directly serves the ease-of-use priority.

## Part D — Data pipeline that makes `/match` useful (must run before launch)

Strict order (each depends on the prior):

1. `workers seed-canonical` — requires `GEMINI_API_KEY`; embeds + upserts the 152 staples. **Gating first step** (vector search has nothing to match without it).
2. `workers ingest <adapter>` × 4 (coles-pdf, woolies-pdf, coles-web, woolies-web) against live sources — populates `catalogues` + `specials` with real prices.
3. `workers enrich-skus` — links `specials.retailer_sku` → canonical (needs `GEMINI_API_KEY`); also the bootstrap source for Part C.
4. Re-embed any newly derived canonical rows; re-tune ivfflat.

- **Runtime cost note:** `/match` embeds **every uncached line at query time** → `GEMINI_API_KEY` is a _runtime_ dependency of the API, not just seed-time. Embedding cost is negligible (<1¢ per full catalogue; per-request scales with traffic). Dominant variable cost is the Gemini LLM fallback (already capped via `withLlmCap`).

## Part E — Production deploy (Round 8 gates 4–6, after A–D)

- Create Vercel project `basketgap-api` (team `team_RL7l6U4gJrlPx1yP9gkfRPAx`), root dir `packages/api`, region `syd1`; add explicit `"framework": null` to `vercel.json`.
- Provision Upstash Redis via Vercel Marketplace (auto-populates `UPSTASH_*`).
- Set env vars — **API (Vercel):** `DATABASE_URL` (**Supabase pooled / port 6543**), `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALLOWED_ORIGINS`, optional `SENTRY_DSN_API`, `MAX_LLM_CALLS_PER_REQUEST`.
- Preview deploy → external curl `/api/match` → production deploy → `gh run watch` CI green.
- Verify `.vercelignore` against real build output (`.vercel/output/` must not contain `.env*`, `docs/`, `memory/`, `.dbpass`, `*.sql`, `packages/workers/`).

## Part F — Pre-production checklist (consolidated)

- [ ] Engine fixes A1–A5 merged + eval harness (Part B) green
- [ ] Catalogue bootstrapped (Part C) — real breadth, not 152 staples
- [ ] Data pipeline run (Part D) — seed → ingest → enrich, `/match` returns real prices
- [ ] **GitHub repo secrets** set for ingest crons: `DATABASE_URL`, `SENTRY_DSN` (and add `GEMINI_API_KEY` + an `enrich-skus` scheduled workflow — currently missing)
- [ ] Vercel env vars set (Part E), `DATABASE_URL` = **pooled** URL
- [ ] Cost cap set manually in Google AI Studio / Cloud billing (hard spend ceiling — the only backstop beyond per-request caps)
- [ ] Upstash rate-limit verified live (30 req/60s per (ip,device)); confirm graceful behavior if Upstash is down
- [ ] Sentry DSN wired for API + workers (recommended for launch)
- [ ] Legal/ToS sanity check on scraping Coles/Woolies catalogues (out of code scope — user awareness)
- [x] Docs: `docs/decisions.md` + `README.md` Round 8/8.5 entries
- [ ] Commit (recommend **3 commits**: `refactor(shared)`, `feat(api)` Round 8, `fix(matching)` Round 8.5), push to `main`, CI green
- [ ] Memory: write `project_basketgap_round8.md` + update `MEMORY.md`

## Verification (end-to-end)

1. **Unit:** each engine fix ships with a failing→passing regression test; `pnpm -r test` green.
2. **Eval harness:** run the labelled set (Part B); record precision-per-band + `needs_attention` rate as the quality baseline; use it to calibrate bands.
3. **Local `/match`:** `tsx` dev-server, curl real baskets ("full cream milk 2L", "bega tasty cheese 500g", "milk 1L" then "milk 3L") — confirm distinct correct results (proves cache fix) and sensible bands.
4. **Data:** after Part D, curl `/match` returns actual Coles/Woolies prices, not `needs_attention`.
5. **Deploy:** external curl against preview then prod; `gh run watch` CI green; inspect `.vercel/output/` for leaked excluded paths.

## Out of scope (later rounds)

Mobile app; `/specials` `/postcodes` endpoints; postcode→zone matching (accepted but ignored today); user accounts/auth; custom domain; WAF/Cloudflare.
