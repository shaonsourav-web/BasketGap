# BasketGap

A guest-first grocery list comparison app for Australia.
Type your shopping list, see what it costs at Coles vs Woolworths.

## Status

Coles weekly PDF adapter shipped — `pnpm --filter @basketgap/workers exec tsx src/cli.ts ingest coles-pdf --fixture <path>` parses the catalogue, persists `catalogues` + `specials` rows, and is idempotent on the source-hash. Cron wired for Wednesday polling; live source URL deferred to the web adapter round.

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
