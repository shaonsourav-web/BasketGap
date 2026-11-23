# Good first issues

Small, self-contained tasks for a first contribution. Each one points at real files in this repository and says what "done" looks like. Several of the matching tasks describe behaviour that was reproduced by running the code on 2026-11-01; the "Observed" lines show the actual output.

Before you start, read [CONTRIBUTING.md](../CONTRIBUTING.md). In short:

- Comment on the issue (or open one) so two people do not do the same task.
- All test data must be synthetic. Never add retailer content, screenshots or real price dumps.
- Run `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` and `pnpm format:check` before opening a pull request.
- For anything in `packages/shared/src/matching/`, also run `pnpm --filter @basketgap/shared test:eval`, and check that the blind-set numbers in [ROADMAP.md](./ROADMAP.md) do not get worse. No API keys are needed for any of this.

These tasks are not tracked as GitHub issues yet. If you want one, open an issue using the feature request or bug report template and link to the heading below.

---

## Matching engine (`packages/shared`)

### 1. Parse a leading-decimal size such as `.5L`

**Where:** `packages/shared/src/matching/steps/04-quantity-size.ts`, tests in `packages/shared/src/matching/steps/__tests__/04-quantity-size.test.ts`.

**Observed:** after cleaning, `milk .5L` becomes `milk .5 L`, and `extractQuantitySize` returns `sizeValue: 5` with a leftover `.` in the residual (`"milk ."`). That is ten times the intended size. The engine then lands `milk .5L` on `needs_attention` (best candidate Oat Milk, score about 0.19), while `milk 0.5L` is `assumed` Full Cream Milk.

**Acceptance criteria:**

- `extractQuantitySize('milk .5 L')` returns `sizeValue: 0.5`, `sizeUom: 'L'`, residual `milk`.
- Existing size tests in the same test file still pass, including `1.5 L`.
- New test cases cover `.5 L`, `.25 kg` and a line with a trailing full stop (`milk 2 L.`) that must still parse as 2 L.
- `pnpm --filter @basketgap/shared test:eval` still reports 99.5% on the 200-line set.

**Related, not part of this task:** `cheese 1/2 kg` is cleaned to `cheese 1 2 kg` and parsed as quantity 1 and size 2 kg. Open a separate issue if you want to handle fractions.

### 2. Parse "half dozen"

**Where:** `packages/shared/src/matching/steps/04-quantity-size.ts` (the `DOZEN_PATTERN` handling), tests in the same `04-quantity-size.test.ts`.

**Observed:** `eggs half dozen` gives `quantity: 12` and the residual `eggs half`. The shopper asked for six eggs and the word "half" is left in the product query. The engine lands the line on `needs_attention`.

**Acceptance criteria:**

- `extractQuantitySize('eggs half dozen')` returns `quantity: 6` and residual `eggs`.
- `dozen eggs`, `1 dozen` and `2 dozen` keep their current results (12, 12, 24); existing dozen tests still pass.
- A new test covers `half dozen`. Do not try to handle `1/2 dozen` here: cleaning turns the slash into a space first, which is the same problem as the fraction note in task 1.
- The 200-line eval and the three blind sets do not regress.

### 3. Recognise an attached `mls` unit

**Where:** the unit-spacing regex in `packages/shared/src/matching/steps/01-clean.ts` (the alternation that inserts a space between a digit and its unit), tests in `packages/shared/src/matching/steps/__tests__/01-clean.test.ts`.

**Observed:** `sparkling water 600 mls` is cleaned and matched (`assumed` Sparkling Water), but `water 600mls` is left as `water 600mls`, no size is extracted, and the line lands on `needs_attention`. The spacing regex lists `ml` and `litres` but not `mls`, and the later unit normaliser only fires on word boundaries.

**Acceptance criteria:**

- `cleanLine('water 600mls')` returns `water 600 ml`.
- `cleanLine('water 600 mls')` and `cleanLine('water 600ml')` are unchanged.
- A test is added for the new case. No existing test changes meaning.
- `test:eval` and the blind sets do not regress.

### 4. More synthetic eval lines for the thinnest categories

**Where:** `packages/shared/src/matching/__tests__/eval/labelled-lines.ts`, and the size guard in `packages/shared/src/matching/__tests__/eval/eval.test.ts`.

**Why:** the built-in catalogue in `packages/shared/src/matching/seed/canonical-seed.ts` has 152 products. Drinks and snacks have 5 products each and eggs 4, and the corresponding sections of the labelled set have only a handful of lines each, so a regression in those areas would be easy to miss.

**Acceptance criteria:**

- Add at least 10 new lines spread across drinks, snacks and eggs. Mix tags already in use (`staple`, `brand`, `typo`, `slang`, `size`, `multipack`). Include at least 3 lines that are deliberately **not** in the catalogue (`expected: null`), and invent every line yourself. Do not copy text from retailer sites.
- Every non-null `expected` is the exact name of a product in `canonical-seed.ts`. The existing test "labels only canonicals that exist in the seed catalogue" enforces this.
- `eval.test.ts` currently asserts the set has at most 200 lines and the set is already at 200. Raise that ceiling deliberately and say so in the PR.
- `pnpm --filter @basketgap/shared test:eval` passes. If a new line exposes a real engine miss, keep it and list it in the PR description as a known false negative, in the same way `bbq snags 500g` is documented. Do not adjust the engine in this PR.

### 5. Add missing Aussie shorthand that maps to an existing product

**Where:** `packages/shared/src/matching/dictionaries/shorthand.ts`, tests in `packages/shared/src/matching/steps/__tests__/03-shorthand.test.ts`.

**Observed:** `broc` and `zukes` both land on `needs_attention` with no confident candidate, although the catalogue has Broccoli and Zucchini and neither abbreviation is ambiguous.

**Acceptance criteria:**

- Add 3 to 8 entries. The grounding rule at the top of `shorthand.ts` applies: every expansion must lead to a product that exists in `canonical-seed.ts`, and ambiguous slang (one word, several products) must not be added.
- Each new entry has a row in the existing `it.each` table in `03-shorthand.test.ts`, and the PR names the catalogue product each entry points to. The "dictionary grounding" tests in that file cover `HEAD_DEFAULTS` only, so for `SHORTHAND` entries the grounding rule is checked in review. They must still pass.
- For each entry, add a matching line to `labelled-lines.ts` if there is room (see task 4) or show the before and after result in the PR description.
- The blind-set numbers do not regress; run all three with `pnpm exec tsx scripts/blind-eval.ts <set>` from `packages/shared`.

---

## API (`packages/api`)

### 6. Unit tests for `hashId`

**Where:** `packages/api/src/lib/hash.ts` (no direct test today; it is only exercised through the request-ID middleware). Add `packages/api/src/__tests__/hash.test.ts`.

**Acceptance criteria:**

- `hashId(null)`, `hashId(undefined)` and `hashId('')` return `'anon'`.
- The same value on the same date returns the same output; the same value on two different dates returns different output (pass the `date` argument).
- The output is 16 lowercase hex characters, and does not contain the input.
- Two different values on the same date return different outputs.
- `pnpm --filter @basketgap/api test` passes. No change to `hash.ts` behaviour.

### 7. Document what happens to whitespace-only lines

**Where:** `packages/api/src/routes/match.ts` (`MatchRequestSchema`), `packages/shared/src/matching/pipeline.ts` (`matchBasket`), tests in `packages/api/src/__tests__/app.test.ts`.

**Why:** reading the code, a line such as `"   "` passes validation (`z.string().min(1)` counts the spaces), and `matchBasket` silently skips lines that are blank after trimming. The response would then contain fewer results than the request had lines, so a client cannot map results back to lines by index. Please confirm this with a test before drawing conclusions.

**Acceptance criteria:**

- Add a test in `app.test.ts` that sends `{ lines: ['milk', '   ', 'eggs'] }` against the real `matchBasket` behaviour (or a faithful stand-in, since the file currently mocks `matchBasket`) and records what the response contains.
- Describe the result in the PR. If it confirms results are shorter than the input, open a separate issue proposing a fix (reject blank lines with `INVALID_BODY`, or return an entry per input line). Do not change the API contract in this PR.

---

## Mobile mock screens (`packages/mobile`)

The mobile app runs on an offline mock with invented data, so these tasks need only the iOS Simulator (`pnpm --filter @basketgap/mobile ios`) or just a code review and the checks below.

### 8. Mark screen titles and section labels as headings

**Where:** `ScreenHeader` and `SectionLabel` in `packages/mobile/src/components/screen.tsx`.

**Observed:** the title `Text` in `ScreenHeader` and the `Text` in `SectionLabel` have no `accessibilityRole`, so a screen reader does not announce them as headings and users cannot jump between sections.

**Acceptance criteria:**

- Both components set `accessibilityRole="header"` on the text they render.
- No visual change.
- `pnpm --filter @basketgap/mobile lint`, `typecheck` and `test` pass.
- The PR says how you checked it (VoiceOver in the Simulator's Accessibility Inspector is fine).

### 9. Announce which store is lower on the "All items" rows

**Where:** `ItemRow` and `PriceCell` in `packages/mobile/app/all-items.tsx`.

**Observed:** which store is lower is shown only by styling (`priceCellLower`). A screen reader reads "Coles", "$4.00", "Woolworths", "$3.50" as separate pieces with no indication of which is lower. Items with a missing price read "No special listed", which is correct and must stay that way.

**Acceptance criteria:**

- Each `PriceCell` is a single accessible element with a label such as "Coles, $4.00" or "Woolworths, $3.50, lower". A missing price reads "Woolworths, no special listed", and is never read as zero.
- The visual design does not change.
- The mock-data checks still pass (`pnpm --filter @basketgap/mobile test`), along with lint and typecheck.

### 10. Fix `freshness()` calling old prices "yesterday"

**Status:** Fixed as part of mobile offers integration. Pick another starter issue.

**Where:** `freshness` in `packages/mobile/src/format.ts`, used by `packages/mobile/app/results.tsx`; add assertions to `packages/mobile/src/mock/verify-mock.ts` (the package's test script).

**Observed:** the function returns "Prices as of 6:15 am today" for anything from today and "yesterday" for **everything else**, including prices that are days or weeks old. The app commits to honest disclosure of when prices were last updated, and real weekly catalogue data will often be older than a day.

**Acceptance criteria:**

- A price from today still reads "today"; from the previous calendar day reads "yesterday"; anything older includes the weekday and date instead (for example "Prices as of 6:15 am Mon 27 Oct"). Agree the exact wording in the issue before coding.
- Assertions covering today, yesterday and a date several days earlier are added to `verify-mock.ts`, using the fixed `now` argument, not the real clock.
- `pnpm --filter @basketgap/mobile test`, `lint` and `typecheck` pass.

---

## Documentation

### 11. Replace stale OpenRouter references in the security doc

**Where:** `docs/ios-approval-and-security.md`.

**Observed:** the doc still names OpenRouter as the LLM gateway in several places (the threat on API keys in the mobile binary, the TLS list, the secrets list, the Australian Privacy Principles entry, and the pre-launch checklist). The code no longer uses it: embeddings go to Google (Gemini) and the optional LLM fallback goes to OpenAI directly. See the 2026-11-01 entry in [decisions.md](./decisions.md). The same doc also describes disabling provider-side retention via "Gemini API data-use settings", which no longer describes the LLM call.

**Acceptance criteria:**

- Run `grep -n -i openrouter docs/ios-approval-and-security.md` and update each hit to the providers the code actually uses. Do not claim anything about the providers' own retention or training policies that you have not read in their current documentation; link to it instead.
- Do not edit `docs/tooling-report.md`, which carries its own "superseded" note, or the historical entries in `docs/decisions.md`.
- Describe in the PR what you changed and why. This is a documentation-only change; `pnpm format:check` must pass.

---

## Picking one

If you are unsure where to start: tasks 3, 6 and 8 are the smallest. Tasks 1, 2 and 10 are small but need a little care with edge cases and tests. Task 4 is the best way to learn how the evaluation harness works.
