# Ingest cadence

How often catalogue data should be refreshed, how long it stays usable, and
what happens when a refresh is missed. This page is retailer-agnostic; how a
given source is fetched or parsed is the job of the adapter that handles it
(see [ingest-adapters.md](./ingest-adapters.md)).

## Refresh rhythm

Retailer specials are published on a weekly cycle, so the target is **one
ingest per catalogue per week**, run soon after the new week's prices go live.
Anything more frequent only helps when a source republishes mid-week.

Ingests are idempotent: they are keyed on the SHA-256 of the source bytes, so
re-running one against unchanged input is a no-op (pass `--force-refresh` to
override). That makes it safe to schedule an ingest more often than the source
changes, and safe to retry after a failure.

How the weekly run is triggered is up to whoever operates the data pipeline:
a scheduler of your choice, or a person running the CLI by hand. This
repository does not ship a retailer ingest schedule. Whatever runs the job
should:

- stagger separate ingests rather than start them all at once;
- prevent two runs of the same source overlapping (a lock or concurrency
  group);
- treat a failed or empty run as a signal to look at, not as the normal
  outcome (see below).

## Sources

- **`import` adapter (built in).** Reads a local `.json` or `.csv` file in the
  documented format, never touches the network, and is the supported way to
  load data you are entitled to share (for example prices typed up from a
  printed catalogue). See [ingest-adapters.md](./ingest-adapters.md).
- **Plugin adapters (optional, external).** Adapters that fetch or parse
  third-party sources are not part of this repository. They are loaded at
  runtime through `BASKETGAP_INGEST_PLUGINS`, and their own schedule, access
  arrangements and failure modes are documented by whoever provides them.

## Freshness: the 14-day window

`OFFER_MAX_AGE_DAYS = 14` in `packages/shared/src/pricing/types.ts`. The best-price
query in `packages/shared/src/pricing/db.ts` only considers a special when its
catalogue's `fetched_at` is within 14 days of today (an explicitly dated special
uses its own validity dates; an undated one falls back entirely on this window).

Consequences:

- A special from a catalogue older than 14 days is **excluded**, not shown as
  stale. The app degrades by having fewer offers, never by quoting an expired
  price.
- Missing one weekly cycle is survivable: the previous week's catalogue is
  still inside the window.
- Missing **two** cycles is not: offers from that retailer start dropping out of
  results, and a basket can silently lose its cheapest option.
- So the hard obligation is: never skip a retailer's refresh two weeks in a row,
  and treat a failed scheduled ingest as same-week work.
- Imports without `validFrom`/`validTo` age out two weeks after they land, so
  dated files are preferable.

## Checking that data landed

After an ingest, confirm the catalogue and its specials are present, then spot
check the matcher against a few real basket lines:

```bash
pnpm --filter @basketgap/workers exec tsx src/cli.ts ingest import --file <file> --dry-run   # parse only
pnpm --filter @basketgap/workers ingest import --file <file>                                 # write
pnpm --filter @basketgap/workers exec tsx src/cli.ts enrich-skus --retailer <retailer>
pnpm --filter @basketgap/workers exec tsx src/cli.ts match --line "<basket line>"
```

`ingest` and `match` need `DATABASE_URL`; `--dry-run` does not.
