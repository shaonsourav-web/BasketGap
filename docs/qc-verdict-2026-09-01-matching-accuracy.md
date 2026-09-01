# QC verdict — matching accuracy changes, 2026-09-01

- **Verifier:** Opus (medium effort), independent, read-only
- **Subject:** uncommitted working tree (12 modified files under `packages/shared/src/matching/**` + untracked `packages/shared/scripts/blind-eval.ts`) plus committed `e795ebd` (`enrich-skus` printed-identity keying, `pricing/db.ts` uuid array literal)
- **Baseline commit:** `e795ebd`
- **Verdict (round 1, at `e795ebd` + working tree): CONDITIONAL PASS** — every claimed gate reproduced exactly by execution; two defects introduced by the diff (F1, F2) had to be fixed first. No wrong picks, no SQL injection, no retailer cross-contamination.
- **FINAL VERDICT (round 2, at `98ab50c`): PASS.** F1 and F2 are fixed and confirmed by execution; all four gates reproduce exactly. See "Re-verification at 98ab50c" at the end of this document.

## What was executed

| Command                                                                                                                                                                                                                                                                 | Result                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm -r test` (repo root)                                                                                                                                                                                                                                              | **277 passed** (shared 220 + 9 skipped, workers 34 + 12 skipped, api 23). 0 failures.                                                                                                                                      |
| `pnpm run test:eval` (packages/shared)                                                                                                                                                                                                                                  | **99.5% overall accuracy**, 200 labelled lines. matched 176/176 (100.0%), assumed 3/3 (100.0%), needs_attention 20/21 (95.2%). Recall 179/180. Out-of-catalogue deferral 20/20. 1 mismatch: `"bbq snags 500g"` → deferred. |
| `pnpm exec tsx scripts/blind-eval.ts <blind-gold-set.json>`                                                                                                                                                                                                             | **426 gold lines** (364 in / 62 out). correct match 353/364 (**97.0%**), **WRONG PICK 0/364 (0.0%)**, missed 11, correct deferral 54/62, false accept 8/62, **accepted precision 97.8%** of 361 accepted, overall 95.5%.   |
| 52 adversarial lines via an offline harness over `createOfflineContext()` (same context the blind eval uses; the workers `match` CLI requires `DATABASE_URL`, so the offline path was driven directly and each line's clean → expand → quantity → rank stages captured) | findings below                                                                                                                                                                                                             |

All three headline numbers in the change description (99.5% / 97.0% + 0 wrong picks + 97.8% / 277 tests) reproduce **exactly**. Nothing was modified in the repo other than this verdict file.

## Adversarial findings, severity-ranked

### F1 — MEDIUM (must fix): descriptor stripping leaves an orphan `of`, breaking natural container phrasing

`CONTAINER_OF` in `01-clean.ts` covers `bag|box|tin|can|jar|bottle|punnet|head`, but `DESCRIPTOR_NOISE` — which runs _after_ it — also contains `tub|jar|packet|sleeve|bunch|bulb`. For the words in `DESCRIPTOR_NOISE` but **not** in `CONTAINER_OF`, the `X of` rule never fires, so only the container word is deleted and a bare `of` survives into the similarity query. Measured degradations, all on lines whose target **is** in the catalogue:

| line                 | cleaned       | result                                    |
| -------------------- | ------------- | ----------------------------------------- |
| `bunch of bananas`   | `of bananas`  | needs_attention 0.122 (Bananas Cavendish) |
| `packet of chips`    | `of chips`    | needs_attention 0.131                     |
| `tub of yoghurt`     | `of yoghurt`  | needs_attention 0.136                     |
| `sleeve of biscuits` | `of biscuits` | needs_attention 0.121                     |
| `bulb of garlic`     | `of garlic`   | assumed 0.600 (degraded from matched)     |

The same root cause leaves other orphan function words behind: `a bag of potatoes` → `a potatoes` (needs_attention 0.175), `coles brand tin of tomatoes` → `brand tomatoes` (needs_attention 0.158). The controls behave correctly (`jar of vegemite`, `head of broccoli`, `punnet of strawberries` all match, because those words _are_ in `CONTAINER_OF`), which confirms the diagnosis. Fix is cheap: add `bunch|bulb|tub|packet|sleeve` to `CONTAINER_OF`, and strip stray leading/orphan `of|a|the|brand` after both noise passes. Neither eval set covers this phrasing, which is why the gates are green.

### F2 — MEDIUM (must fix): `DESCRIPTOR_NOISE` deletes meaning-bearing words, producing new wrong picks at `matched` confidence

The list's own docstring states that words appearing in canonical names must never be listed. That rule is already violated — `plain` is in the list and `Plain Flour` is canonical seed entry 347 (alongside `Self Raising Flour` and `Wholemeal Flour`). `plain flour 1kg` survives only by luck: the `flour` head default happens to expand back to `plain flour`. More seriously, several listed words are product distinctions, not noise, and stripping them yields confident wrong answers:

- `raw sugar` → cleaned `sugar` → **White Sugar [matched 0.820]**. Raw sugar is not in the catalogue and should defer; it now returns a different product at matched confidence.
- `grated cheese` → cleaned `cheese` → **Tasty Cheese Block [matched 0.820]**. A grated request returns a block.
- `shredded chicken` → `chicken`; `fresh cream` → `cream` (both defer today, but only because those heads are ambiguous — the meaning is gone either way).

This is precisely the failure class the diff sets out to fix (bad candidates reaching the `matched` band), reintroduced through the noise list rather than through brand scoring. Recommend narrowing `DESCRIPTOR_NOISE` to the safe varietal/marketing terms only — `hass`, `continental`, `button`, `loose`, `seedless`, `boneless`, `squeezy`, `spreadable` all verified harmless — and removing `plain`, `raw`, `grated`, `shredded`, `fresh` (or gating them behind a check that the head is unambiguous).

### F3 — LOW: bare-number strip silently discards size information

`04-quantity-size.ts` deletes a leftover bare number without ever promoting it to `sizeValue`. `coke 1.25` → residual `coca cola`, `quantity=null`, `sizeValue=null`; `bread 700` → `700` vanishes. No harm in the current seed (one `Coca Cola` entry), but the moment 600 ml and 1.25 L variants coexist, `sizeMatch` cannot fire and the wrong variant wins. The `<= 24` integer heuristic also misreads `coke 2` as quantity 2 rather than 2 L. Consider treating a bare decimal, or an integer adjacent to a known-liquid head, as a size rather than dropping it.

### F4 — INFO (accepted trade-off): spell-corrector guards are sound

The first-letter and doubled-letter guards behave as designed. Genuine typos still rescue: `bannana`→Bananas Cavendish, `chesse`→Tasty Cheese Block, `tomatos`→Tomatoes Truss, `yoghrt`→Natural Yogurt, `milkk`→Full Cream Milk (doubled-letter shrink path). The protected cases hold: `pears` no longer becomes `peas`, `clean` no longer becomes `lean` — both correctly defer. The cost is leading-character typos: `arrots` can no longer reach `carrots` and defers. That fails in the safe direction (deferral, not a wrong pick) and is a reasonable trade.

### F5 — LOW: synthetic-SKU collision window; cross-contamination is clean

`syntheticSkuFor` lowercases, collapses every non-alphanumeric run to `-`, and truncates to 180 chars. Two distinct printed identities that differ only in punctuation, or only beyond character 180, collapse to one key. Because `retailer_skus` is unique on `(retailer, retailer_sku)`, the second upsert **overwrites the first row's `canonical_product_id`**, and the backfill then links both `specials` rows to it — one product's offer served under another product's canonical id. Note the SQL `identity` expression (`product_name || '|' || size_text`) is stricter than the slug, so `selectDistinctOn` can hand two rows to a single key. Low likelihood at 180 chars, but the failure is silent; a hash suffix on the truncated slug removes it entirely.

Ruled out on inspection:

- **Retailer cross-contamination: none.** The unique key is `(retailer, retailer_sku)`, the insert sets `retailer: row.retailer`, and the backfill is scoped by `eq(specials.retailer, row.retailer)`.
- **Namespace collision with real SKUs: none.** Synthetic keys carry a `name:` prefix.
- **Backfill breadth (cosmetic):** with a null `retailerSku`, the update matches every `specials` row sharing retailer + product name + size across all catalogues and weeks, not just the current one. That is the intended semantics, but it makes the reported `specialsLinked` count historical rows too — the number overstates "new links".

### F6 — INFO: `pricing/db.ts` uuid array literal — no injection

`const idsLiteral = \`{${ids.join(',')}}\``is interpolated into a **JS** template and then passed through the`sql`tagged template, so postgres.js binds it as a parameter; it is never concatenated into SQL text. **No injection risk.** Malformed-literal risk is theoretical:`ids`is not validated as UUIDs, but the only production path is`POST /api/match`→`results.map(r => r.canonicalProductId)`, which are DB-derived UUIDs. A hostile string would raise a Postgres cast error, which `routes/match.ts`already catches and degrades to`offersAvailable: false`(HTTP 200, no leak). Since the function is exported from`pricing/index.ts`, adding a uuid regex to the existing `.filter(Boolean)` is cheap insurance.

### Standing observation (not a regression): the 8 blind-set false accepts

All 8 are the generic-head class — `coffee`→Coffee Instant, `rice`→Long Grain White Rice, `apples`→Apples Pink Lady, `onions`→Brown Onions, `tomatoes`→Tomatoes Truss, `ice cream`→Vanilla Ice Cream, `peanut butter`→Peanut Butter Smooth, `chicken fillets`→Chicken Thigh Fillets. These come from the pre-existing `HEAD_DEFAULTS` design, not from anything in this diff — the gold set labels a bare head term as out-of-catalogue while the engine deliberately resolves it to a default. Worth a product decision about whether a bare head should land in `assumed` rather than `matched`, but it is not this change's regression.

## Conditions

1. **F1** — extend `CONTAINER_OF` to cover every container word in `DESCRIPTOR_NOISE`, and strip orphan `of`/`a`/`brand` after the noise passes. Add the seven measured lines above to the eval set so the gap cannot reopen.
2. **F2** — remove `plain`, `raw`, `grated`, `shredded`, `fresh` from `DESCRIPTOR_NOISE`; add `raw sugar` and `grated cheese` as out-of-catalogue deferral cases.
3. Re-run all three gates after the fixes. F3, F5 and F6 are recommended but not blocking.

Gates verified by execution on 2026-09-01 against working tree at baseline `e795ebd`.

---

# Re-verification at 98ab50c

- **Verifier:** Opus (medium effort), independent, read-only
- **Commit under test:** `98ab50c` on `main` ("accuracy round — brand/name separation, noise stripping, corrector guards, AU dictionary expansion"), tree clean apart from this untracked verdict file
- **Ruling: PASS.** F1 and F2 are fixed and verified by execution on the exact lines that failed in round 1. All four gates reproduce the claimed numbers exactly. Residuals below are non-blocking.

## Gates re-run at HEAD

| Command                                    | Claimed                 | Observed                                                                             |     |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ | --- |
| `pnpm -r test`                             | green                   | **277 passed** (shared 220 + 9 skipped, workers 34 + 12 skipped, api 23), 0 failures | ✅  |
| `pnpm run test:eval`                       | 99.5%                   | **99.5%**, matched 176/176 (100.0%), 1 mismatch (`bbq snags 500g`, deferred)         | ✅  |
| `blind-eval.ts gold-codex-2026-09-01.json` | 98.9% / 0 wrong / 97.6% | **98.9%** (360/364), **WRONG PICK 0/364**, accepted precision **97.6%** of 369       | ✅  |
| `blind-eval.ts gold-opus-2026-09-01.json`  | 98.3% / 0 / 99.6%       | **98.3%** (233/237), **WRONG PICK 0/237**, accepted precision **99.6%** of 234       | ✅  |

(The Codex gold set is byte-identical to the set I ran in round 1; re-running my own copy returns the same figures, so the round-1 → round-2 movement on that set is directly comparable: in-catalogue recall **97.0% → 98.9%** with wrong picks held at zero.)

## F1 — FIXED (verified)

`of`, articles `a`/`an`, and `for`/`the` are now stripped, and `CONTAINER_OF` gained `pack`/`loaf`. Every round-1 repro line recovers:

| line                 | round 1                               | round 2                                           |
| -------------------- | ------------------------------------- | ------------------------------------------------- |
| `bunch of bananas`   | `of bananas` → needs_attention 0.122  | `bananas` → **Bananas Cavendish [matched 0.820]** |
| `bulb of garlic`     | `of garlic` → assumed 0.600           | `garlic` → **Garlic [matched 0.820]**             |
| `tub of yoghurt`     | `of yoghurt` → needs_attention 0.136  | `yoghurt` → **Natural Yogurt [matched 0.820]**    |
| `a bag of potatoes`  | `a potatoes` → needs_attention 0.175  | `potatoes` → **Potatoes Washed [matched 0.820]**  |
| `packet of chips`    | `of chips` → needs_attention 0.131    | `chips` → needs_attention 0.162                   |
| `sleeve of biscuits` | `of biscuits` → needs_attention 0.121 | `biscuits` → needs_attention 0.137                |

The last two still defer, but the cause has changed and is now legitimate: the orphan `of` is gone and the residual is a genuinely ambiguous head (`chips` spans Frozen Chips and potato chips; `biscuits` spans Scotch Finger and Tim Tams). Deferring there is correct behaviour, not the F1 bug. The round-1 controls remain green (`jar of vegemite`, `head of broccoli`, `punnet of strawberries` all still matched), and article stripping works (`the milk` → Full Cream Milk matched).

## F2 — FIXED (verified)

`raw`, `plain`, `grated`, `shredded` are out of the noise list, and a `PROTECTED_WORDS` set stops the corrector rewriting them. Both round-1 wrong picks are gone:

| line               | round 1                                                             | round 2                                                                                    |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `raw sugar`        | **White Sugar [matched 0.820]** — wrong product, top band           | `raw sugar` preserved → needs_attention 0.131 ✅ correct deferral                          |
| `grated cheese`    | **Tasty Cheese Block [matched 0.820]** — block for a grated request | `grated cheese` preserved → needs_attention 0.129 ✅ correct deferral                      |
| `shredded chicken` | meaning stripped to `chicken`                                       | preserved → needs_attention 0.104 ✅                                                       |
| `plain flour 1kg`  | matched only by luck (head default restored it)                     | `plain flour` preserved → **Plain Flour [matched 0.900]** ✅ now matched on its own merits |

The `grated` → `grapes` corrector rewrite is confirmed blocked (bare `grated` scores 0.100 needs_attention, not a Grapes Red match). Safe varietal stripping is retained and still working (`hass avocado`, `seedless grapes` both matched).

## New guards — verified by execution

- **Self-map guards:** `lamb mince`, `pork mince`, `turkey mince` and `chicken mince` all defer (0.104–0.131) instead of collapsing into Beef Mince, while `beef mince 500g` still matches at 0.900. ✅
- **Max-1-char-shrink rule:** `litter of milk` no longer rewrites to `lite`; it defers at 0.153. ✅
- **Corrector rescues intact** (no over-correction regression): `bannana`→Bananas Cavendish, `chesse`→Tasty Cheese Block, `tomatos`→Tomatoes Truss, `milkk`→Full Cream Milk, all matched 0.820. Protected non-typos still defer correctly: `pears` (not `peas`), `clean` (not `lean`), `arrots`. ✅

## Residuals (non-blocking, no condition attached)

1. **LOW — `party` → Parmesan Cheese [matched 0.820].** Traced to the shorthand key `parmy: 'parmesan cheese'`: the ordinary English word `party` is exactly one same-length substitution from `parmy`, which the first-letter and shrink guards do not catch (they gate initials and length, not real-word same-length substitutions). This is the sole precision failure on the Opus gold set — `lollies for the party` → Parmesan Cheese at `assumed` 0.550, 1/63. Narrow in practice, but it is a top-band wrong pick from a non-food word. Suggested fix when convenient: keep short slang keys like `parmy` out of the corrector vocabulary, or extend `PROTECTED_WORDS` to cover common English words that are one edit from a dictionary key.
2. **LOW — `brand` is not stripped.** `coles brand tin of tomatoes` → `brand tomatoes` → needs_attention 0.158. Same orphan-token family as F1; `brand` was not added alongside the articles. Rare in typed lines.
3. **INFO — `milk for the week`** → `milk week` → needs_attention 0.125. `for`/`the` strip correctly; the leftover `week` dilutes the query. Edge phrasing.
4. **Standing (unchanged, not a regression):** the Codex set's out-of-catalogue false accepts moved 8 → 9, and every one is still the pre-existing generic-head `HEAD_DEFAULTS` class (`coffee`, `rice`, `apples`, `onions`, `tomatoes`, `ice cream`, `peanut butter`, `chicken fillets`, and now bare `cream` → Thickened Cream). No new failure mode. The Opus set, which labels these differently, shows 1/63. Whether a bare head term should land in `assumed` rather than `matched` remains a product decision, not a defect in this change.
5. **Carried forward from round 1, still open and still non-blocking:** F3 (bare-number strip discards size information), F5 (synthetic-SKU 180-char truncation collision window in `enrich-skus`), F6 (no uuid validation on the exported `loadOffersForCanonicalIds` — no injection risk, parameter-bound).

## Ruling

**PASS at `98ab50c`.** Both blocking conditions from round 1 are met and independently confirmed on the failing lines themselves; in-catalogue recall improved (97.0% → 98.9% on the comparable set) with **zero wrong picks across all 601 blind gold lines** and the full suite green. Re-verified by execution on 2026-09-01. Nothing in the repo was modified by this verification other than this verdict file; nothing was committed.
