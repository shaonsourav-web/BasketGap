# Ingest cadence

What runs when, what is automated, what the owner has to do by hand, and what
happens when nothing runs.

## Schedule

All four ingest workflows run **weekly on Wednesday morning Sydney time**, when
the new weekly catalogues land. GitHub cron is UTC and does not observe DST, so
a fixed UTC slot drifts one hour across the year — Sydney is AEST (UTC+10)
roughly Apr–Oct and AEDT (UTC+11) roughly Oct–Apr. The slots below were picked
so both ends of that drift stay inside Wednesday morning.

| Workflow             | Cron (UTC)    | AEST (Apr–Oct) | AEDT (Oct–Apr) | Status                                   |
| -------------------- | ------------- | -------------- | -------------- | ---------------------------------------- |
| `ingest-coles-pdf`   | `0 20 * * 2`  | Wed 06:00      | Wed 07:00      | Automated, must stay green               |
| `ingest-woolies-pdf` | `30 20 * * 2` | Wed 06:30      | Wed 07:30      | Automated, must stay green               |
| `ingest-coles-web`   | `0 21 * * 2`  | Wed 07:00      | Wed 08:00      | Automated but **expected to be blocked** |
| `ingest-woolies-web` | `30 21 * * 2` | Wed 07:30      | Wed 08:30      | Automated but **expected to be blocked** |

Runs are staggered 30 minutes apart so two Playwright/PDF jobs never contend,
and each workflow has a `concurrency` group so a manual `workflow_dispatch`
cannot collide with the scheduled run.

Every workflow also accepts `workflow_dispatch` with an optional `source_url`
override and a `force_refresh` toggle. Source URLs come from repo Variables
(`CATALOGUE_URL_COLES`, `CATALOGUE_URL_WOOLIES`, `CATALOGUE_URL_COLES_WEB`,
`CATALOGUE_URL_WOOLIES_WEB`); credentials come from the existing `DATABASE_URL`
and `SENTRY_DSN` secrets. No new secrets were introduced.

## Automated vs owner-manual

**Automated — PDF adapters.** The weekly catalogue PDFs are fetched over plain
HTTP and are not bot-walled. `ingest-coles-pdf` and `ingest-woolies-pdf` are the
real automation: if either goes red, the week's data did not land and it needs
fixing.

**Effectively owner-manual — web adapters.** Live testing showed both retailers
bot-block headless Playwright from datacentre IPs, so a CI run of `coles-web` /
`woolies-web` almost never sees a product tile. The workflows still run weekly —
they are the canary that tells us if the wall ever comes down — but they
classify their own outcome:

- **exit 0 with `itemCount > 0`** → real data, logged `OK`.
- **exit 0 with `itemCount == 0`**, or a failure whose log matches a block
  signature (Playwright selector timeout, `net::ERR_*`, HTTP 401/403, "Access
  Denied", captcha / "Just a moment" / "Pardon Our Interruption") → logged
  `BLOCKED_OR_EMPTY`, raised as a GitHub **warning annotation**, workflow exits
  **green**. This is the expected weekly outcome.
- **anything else** — DB connection refused, missing config, a code or schema
  error → logged as an error annotation and the workflow **fails red**.

That split is the point: a bot wall is not a regression and must not train us to
ignore a red X, but a genuine breakage must still be loud.

The supported path for current-week web specials is therefore the owner capture
runbook: **`packages/workers/scripts/CAPTURE.md`**. Once a week the owner opens
the specials pages in their own Chrome, extracts tiles to JSON, converts them
with `packages/workers/scripts/make-fixtures.py`, and ingests via
`ingest <adapter> --fixture <file>`, then runs `enrich-skus` and a `match`
spot-check. Roughly 15 minutes, same Wednesday morning slot.

## Freshness: the 14-day window

`OFFER_MAX_AGE_DAYS = 14` in `packages/shared/src/pricing/types.ts`. The best-price
query in `packages/shared/src/pricing/db.ts` only considers a special when its
catalogue's `fetched_at` is within 14 days of today (an explicitly dated special
uses its own validity dates; an undated one falls back entirely on this window).

Consequences:

- A special from a catalogue older than 14 days is **excluded**, not shown as
  stale. The app degrades by having fewer offers, never by quoting an expired
  price.
- Missing one weekly cycle is survivable — the previous week's catalogue is
  still inside the window.
- Missing **two** cycles is not: offers from that retailer start dropping out of
  results, and a basket can silently lose its cheapest option.
- So the hard obligation is: never skip the owner capture two Wednesdays in a
  row, and treat a red PDF workflow as same-week work.

## Standing task — woolies-web shadow DOM

Woolworths renders its specials shelf inside a **shadow DOM**, which the current
`woolies-web` parser does not pierce. Even with the bot wall solved, scheduled
`ingest-woolies-web` scraping stays dependent on the shadow-DOM-aware adapter
that is being rewritten in parallel.

Until that adapter lands:

- Treat `ingest-woolies-web`'s green `BLOCKED_OR_EMPTY` runs as expected.
- Get Woolworths web specials through `CAPTURE.md` only.
- Do not patch `packages/workers/src/adapters/woolies-web/**` from the capture
  side — the capture script targets the fixture selectors deliberately, and
  competing edits to the adapter will collide with the rewrite.

When the rewritten adapter is merged, re-check whether `ingest-woolies-web` can
produce `itemCount > 0` from CI; if it still cannot, the block is the IP wall,
not the DOM, and this page's split stands unchanged.
