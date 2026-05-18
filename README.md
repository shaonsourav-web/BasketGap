# BasketGap

A guest-first grocery list comparison app for Australia.
Type your shopping list, see what it costs at Coles vs Woolworths.

## Status

Both retailer weekly PDF adapters shipped — `workers ingest coles-pdf | woolies-pdf [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]` parses each retailer's catalogue, persists `catalogues` + `specials` rows under the right `retailer` discriminator, and is idempotent on the source-hash. Cron workflows wired for Wednesday polling on both; live source URL discovery deferred to the web adapter round.

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
