# BasketGap

A guest-first grocery list comparison app for Australia.
Type your shopping list, see what it costs at Coles vs Woolworths.

## Status

Three adapters shipped — `workers ingest coles-pdf | woolies-pdf | coles-web [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]`. The PDF adapters parse each retailer's weekly catalogue; `coles-web` renders the "Down Down" specials page via Playwright headless Chromium and parses it with cheerio. All three persist into the same `catalogues` + `specials` tables under the right `(retailer, source_type)` discriminator, idempotent on `source_hash`. Cron workflows: Wednesday weekly polling for PDFs, daily 06:00 AEST for `coles-web`. Live source URL for `coles-web` is set via repo Variable `CATALOGUE_URL_COLES_WEB`; Woolies "Prices Dropped" web adapter is the next round.

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
