# BasketGap

A guest-first grocery list comparison app for Australia.
Type your shopping list, see what it costs at Coles vs Woolworths.

## Status

All four retailer adapters shipped — `workers ingest coles-pdf | woolies-pdf | coles-web | woolies-web [--fixture <path> | --source-url <url>] [--dry-run] [--force-refresh]`. The PDF adapters parse each retailer's weekly catalogue; the web adapters render the "Down Down" / "Prices Dropped" pages via Playwright headless Chromium and parse them with cheerio. All persist into the same `catalogues` + `specials` tables under the right `(retailer, source_type)` discriminator, idempotent on `source_hash`. Cron workflows: weekly Wednesday polling for PDFs, daily 06:00 AEST (Coles) and 06:30 AEST (Woolies) for the web adapters. Live source URLs are set via repo Variables `CATALOGUE_URL_COLES`, `CATALOGUE_URL_WOOLIES`, `CATALOGUE_URL_COLES_WEB`, `CATALOGUE_URL_WOOLIES_WEB`.

## Documentation

- [Specification](./BasketGap.md)
- [Decisions log](./docs/decisions.md)
